-- Step 6 (CRD-18, CRD-19): CPD log, verified by HR like a credential, and progress toward
-- each type's CPD target over the current renewal cycle. Targets (credential_types
-- .cpd_points_required / cpd_cycle_months) stay empty until the owner sets them:
-- ⚠ VERIFY each professional body's rule before switching one on.

create table public.cpd_activities (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  -- The registration / practising certificate the points count toward.
  credential_type_id uuid not null references public.credential_types (id),
  title text not null check (btrim(title) <> '' and char_length(title) <= 200),
  provider text check (char_length(provider) <= 200),
  activity_date date not null,
  points numeric(6, 1) not null default 0 check (points >= 0),
  hours numeric(6, 1) check (hours >= 0),
  category text not null default 'course'
    check (category in ('course', 'conference', 'workshop', 'webinar', 'reading', 'other')),
  file_path text,
  status text not null default 'pending' check (status in ('pending', 'verified', 'rejected', 'withdrawn')),
  submitted_by uuid default auth.uid() references auth.users (id) on delete set null,
  verified_by uuid references auth.users (id) on delete set null,
  verified_at timestamptz,
  reject_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create index cpd_activities_employee_idx on public.cpd_activities (employee_id, activity_date desc);
create index cpd_activities_tenant_status_idx on public.cpd_activities (tenant_id, status);

create trigger cpd_activities_set_updated_at before update on public.cpd_activities
  for each row execute function public.set_updated_at();
-- "a_": BEFORE triggers fire in name order, and the checks below need tenant_id.
create trigger cpd_activities_a_set_tenant
  before insert or update of employee_id on public.cpd_activities
  for each row execute function public.set_tenant_from_employee();

create or replace function public.cpd_activities_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.credential_types t
    where t.id = new.credential_type_id and t.tenant_id = new.tenant_id and t.tracks_cpd
  ) then
    raise exception 'CPD counts toward a credential type that tracks CPD' using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger cpd_activities_before_write
  before insert or update of credential_type_id on public.cpd_activities
  for each row execute function public.cpd_activities_before_write();

select audit.enable('public.cpd_activities');

alter table public.cpd_activities enable row level security;
revoke all on public.cpd_activities from anon;

create policy cpd_activities_select on public.cpd_activities for select to authenticated
  using (
    tenant_id = public.auth_tenant_id()
    and (
      public.auth_role() in ('owner', 'hr_admin', 'auditor')
      or employee_id = public.auth_employee_id()
    )
  );
create policy cpd_activities_insert on public.cpd_activities for insert to authenticated
  with check (
    tenant_id = public.auth_tenant_id()
    and status = 'pending'
    and (
      public.auth_role() in ('owner', 'hr_admin')
      or (employee_id = public.auth_employee_id() and submitted_by = auth.uid())
    )
  );
create policy cpd_activities_update on public.cpd_activities for update to authenticated
  using (
    tenant_id = public.auth_tenant_id()
    and status = 'pending'
    and (
      public.auth_role() in ('owner', 'hr_admin')
      or (employee_id = public.auth_employee_id() and submitted_by = auth.uid())
    )
  )
  with check (tenant_id = public.auth_tenant_id());

revoke insert, update, delete on public.cpd_activities from authenticated;
grant insert (employee_id, credential_type_id, title, provider, activity_date, points, hours, category)
  on public.cpd_activities to authenticated;
grant update (credential_type_id, title, provider, activity_date, points, hours, category)
  on public.cpd_activities to authenticated;

-- Owner / HR admin verify or reject (reason required); the employee is notified.
create or replace function public.decide_cpd(p_activity_id uuid, p_decision text, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_activity public.cpd_activities;
  v_reason text := nullif(btrim(p_reason), '');
  v_user uuid;
begin
  if public.auth_role() is null or public.auth_role() not in ('owner', 'hr_admin') then
    raise exception 'Only the owner or HR admin can verify CPD' using errcode = '42501';
  end if;
  if p_decision not in ('verified', 'rejected') then
    raise exception 'Decision must be verified or rejected' using errcode = '22023';
  end if;
  if p_decision = 'rejected' and v_reason is null then
    raise exception 'A reason is required to reject' using errcode = '22023', hint = 'reason_required';
  end if;
  select * into v_activity from public.cpd_activities
  where id = p_activity_id and tenant_id = public.auth_tenant_id() for update;
  if not found then
    raise exception 'CPD activity not found' using errcode = 'P0002';
  end if;
  if v_activity.status <> 'pending' then
    raise exception 'This activity is not waiting for a decision' using errcode = '22023';
  end if;
  if v_activity.submitted_by = auth.uid() and v_activity.employee_id = public.auth_employee_id() then
    raise exception 'You cannot verify your own CPD' using errcode = '42501';
  end if;

  update public.cpd_activities
  set status = p_decision,
      verified_by = auth.uid(),
      verified_at = now(),
      reject_reason = case when p_decision = 'rejected' then v_reason end
  where id = v_activity.id;

  for v_user in
    select m.user_id from public.memberships m
    where m.employee_id = v_activity.employee_id and m.is_active and m.user_id is not null
  loop
    perform public.notify(v_user, 'cpd_decided', jsonb_build_object(
      'title', v_activity.title, 'decision', p_decision, 'reason', v_reason), '/staff/credentials/cpd');
  end loop;
end;
$$;

-- The employee withdraws their own pending activity.
create or replace function public.withdraw_cpd(p_activity_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.cpd_activities
  set status = 'withdrawn'
  where id = p_activity_id
    and tenant_id = public.auth_tenant_id()
    and status = 'pending'
    and (
      public.auth_role() in ('owner', 'hr_admin')
      or (employee_id = public.auth_employee_id() and submitted_by = auth.uid())
    );
  if not found then
    raise exception 'CPD activity not found' using errcode = 'P0002';
  end if;
end;
$$;

revoke execute on function public.decide_cpd(uuid, text, text) from public, anon;
revoke execute on function public.withdraw_cpd(uuid) from public, anon;
grant execute on function public.decide_cpd(uuid, text, text) to authenticated;
grant execute on function public.withdraw_cpd(uuid) to authenticated;

-- Upload gate for a CPD certificate (one file per activity, replaced on re-upload).
create or replace function public.cpd_upload_target(p_activity_id uuid)
returns table (tenant_id uuid, employee_id uuid, folder text, old_path text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_activity public.cpd_activities;
begin
  select * into v_activity from public.cpd_activities a
  where a.id = p_activity_id
    and a.tenant_id = public.auth_tenant_id()
    and a.status = 'pending'
    and (
      public.auth_role() in ('owner', 'hr_admin')
      or (a.employee_id = public.auth_employee_id() and a.submitted_by = auth.uid())
    );
  if not found then
    raise exception 'CPD activity not found' using errcode = 'P0002';
  end if;
  return query select v_activity.tenant_id, v_activity.employee_id,
    v_activity.tenant_id || '/' || v_activity.employee_id || '/cpd/' || v_activity.id || '/',
    v_activity.file_path;
end;
$$;
revoke execute on function public.cpd_upload_target(uuid) from public, anon;
grant execute on function public.cpd_upload_target(uuid) to authenticated;

-- v_cpd_progress (data-model.md §3.3): per employee × CPD-tracking type. The cycle runs to
-- the current verified credential's expiry, starting cpd_cycle_months earlier (or at its
-- effective date). target_to_date is the required points pro-rated to today.
create or replace function public.cpd_progress_all(p_today date)
returns table (
  tenant_id uuid,
  employee_id uuid,
  credential_type_id uuid,
  name_en text,
  name_ms text,
  credential_id uuid,
  cycle_start date,
  cycle_end date,
  points_verified numeric,
  points_pending numeric,
  points_required numeric,
  target_to_date numeric,
  on_track boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with base as (
    select r.tenant_id, r.employee_id, r.credential_type_id, t.name_en, t.name_ms,
      r.verified_id as credential_id,
      case
        when r.expiry_date is not null and t.cpd_cycle_months is not null
          then greatest((r.expiry_date - make_interval(months => t.cpd_cycle_months))::date, r.effective_date)
        else r.effective_date
      end as cycle_start,
      r.expiry_date as cycle_end,
      t.cpd_points_required
    from public.credential_status_rows_all(p_today) r
    join public.credential_types t on t.id = r.credential_type_id
    where t.tracks_cpd
  ),
  points as (
    select b.employee_id, b.credential_type_id,
      coalesce(sum(a.points) filter (where a.status = 'verified'), 0) as verified,
      coalesce(sum(a.points) filter (where a.status = 'pending'), 0) as pending
    from base b
    left join public.cpd_activities a
      on a.employee_id = b.employee_id and a.credential_type_id = b.credential_type_id
      and (b.cycle_start is null or a.activity_date >= b.cycle_start)
      and (b.cycle_end is null or a.activity_date <= b.cycle_end)
    group by b.employee_id, b.credential_type_id
  )
  select b.tenant_id, b.employee_id, b.credential_type_id, b.name_en, b.name_ms, b.credential_id,
    b.cycle_start, b.cycle_end, p.verified, p.pending, b.cpd_points_required,
    case
      when b.cpd_points_required is null or b.cycle_start is null or b.cycle_end is null then null
      when b.cycle_end <= b.cycle_start then b.cpd_points_required
      else round(b.cpd_points_required * least(1, greatest(0,
        (p_today - b.cycle_start)::numeric / (b.cycle_end - b.cycle_start))), 1)
    end as target,
    case
      when b.cpd_points_required is null or b.cycle_start is null or b.cycle_end is null then null
      else p.verified >= round(b.cpd_points_required * least(1, greatest(0,
        (p_today - b.cycle_start)::numeric / nullif(b.cycle_end - b.cycle_start, 0))), 1)
    end
  from base b
  join points p on p.employee_id = b.employee_id and p.credential_type_id = b.credential_type_id;
$$;
revoke execute on function public.cpd_progress_all(date) from public, anon, authenticated;

create or replace function public.cpd_progress_visible()
returns table (
  tenant_id uuid, employee_id uuid, credential_type_id uuid, name_en text, name_ms text,
  credential_id uuid, cycle_start date, cycle_end date, points_verified numeric,
  points_pending numeric, points_required numeric, target_to_date numeric, on_track boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.* from public.cpd_progress_all(public.malaysia_today()) c
  where c.tenant_id = public.auth_tenant_id()
    and (
      public.auth_role() in ('owner', 'hr_admin', 'auditor')
      or c.employee_id = public.auth_employee_id()
      or public.is_manager_of(c.employee_id)
    );
$$;
revoke execute on function public.cpd_progress_visible() from public, anon;
grant execute on function public.cpd_progress_visible() to authenticated;

create view public.v_cpd_progress as select * from public.cpd_progress_visible();
revoke all on public.v_cpd_progress from public, anon;
grant select on public.v_cpd_progress to authenticated;
