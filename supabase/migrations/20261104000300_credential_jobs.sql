-- Step 6 (CRD-11, CRD-12, CRD-19): the daily credential scan and the weekly CPD scan
-- (data-model.md §7), scheduled with pg_cron. Both take "today" as a parameter so a test,
-- or the owner, can simulate a date: select public.credential_status_scan('2027-01-01');

create extension if not exists pg_cron;

-- Notifies the employee (if they have an account) and the reviewers (HR admin, or the owner
-- when there is none). data.for_hr tells the text which version to show.
create or replace function public.notify_credential_people(
  p_employee_id uuid,
  p_template text,
  p_data jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant_id uuid;
  v_user record;
  v_count integer := 0;
begin
  select e.tenant_id into v_tenant_id from public.employees e where e.id = p_employee_id;
  for v_user in
    select m.user_id, false as for_hr from public.memberships m
    where m.employee_id = p_employee_id and m.is_active and m.user_id is not null
    union
    select m.user_id, true from public.memberships m
    where m.tenant_id = v_tenant_id and m.is_active and m.user_id is not null
      and m.role = public.hr_reviewer_role(v_tenant_id)
      and m.employee_id is distinct from p_employee_id
  loop
    perform public.notify(
      v_user.user_id, p_template, p_data || jsonb_build_object('for_hr', v_user.for_hr),
      case when v_user.for_hr then '/admin/compliance' else '/staff/credentials' end
    );
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
revoke execute on function public.notify_credential_people(uuid, text, jsonb) from public, anon, authenticated;

-- CRD-11 / CRD-12. Daily at 06:00 Malaysia time:
-- 1. renewals that have come into force supersede the older verified record;
-- 2. a reminder at each offset the credential has crossed (90 / 60 / 30 / 7 days by default)
--    and on the expiry date (offset 0). Several offsets crossed at once (e.g. a credential
--    added 20 days before expiry) give one reminder, and none are ever repeated;
-- 3. expired credentials raise a CRED_EXPIRED compliance alert; renewed ones resolve it.
-- No reminders once a renewal is pending or verified. Returns the number of reminders sent.
create or replace function public.credential_status_scan(p_today date default public.malaysia_today())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row record;
  v_days integer;
  v_new integer;
  v_sent integer := 0;
begin
  update public.staff_credentials old
  set status = 'superseded'
  where old.status = 'verified'
    and exists (
      select 1 from public.staff_credentials n
      where n.employee_id = old.employee_id
        and n.credential_type_id = old.credential_type_id
        and n.status = 'verified'
        and n.id <> old.id
        and n.effective_date <= p_today
        and n.effective_date > old.effective_date
    );

  for v_row in
    select s.id, s.tenant_id, s.employee_id, s.expiry_date, t.code, t.name_en, t.name_ms,
           t.reminder_offsets_days, e.full_name
    from public.staff_credentials s
    join public.credential_types t on t.id = s.credential_type_id
    join public.employees e on e.id = s.employee_id
    where s.status = 'verified'
      and s.expiry_date is not null
      and e.deleted_at is null
      and e.status <> 'left'
      and s.expiry_date - p_today <= (select max(o) from unnest(t.reminder_offsets_days) as o)
      and not exists (
        select 1 from public.staff_credentials n
        where n.previous_id = s.id and n.status in ('pending', 'verified')
      )
  loop
    v_days := v_row.expiry_date - p_today;

    with crossed as (
      insert into public.credential_reminders_sent (tenant_id, staff_credential_id, offset_days)
      select v_row.tenant_id, v_row.id, o
      from unnest(v_row.reminder_offsets_days || 0) as o
      where o >= v_days
      on conflict (staff_credential_id, offset_days) do nothing
      returning 1
    )
    select count(*) into v_new from crossed;

    if v_new > 0 then
      perform public.notify_credential_people(
        v_row.employee_id,
        case when v_days < 0 then 'credential_expired' else 'credential_expiring' end,
        jsonb_build_object(
          'credential_id', v_row.id,
          'type_code', v_row.code,
          'type_name_en', v_row.name_en,
          'type_name_ms', v_row.name_ms,
          'employee_name', v_row.full_name,
          'days_left', greatest(v_days, 0),
          'expiry_date', v_row.expiry_date
        )
      );
      v_sent := v_sent + 1;
    end if;

    if v_days < 0 then
      insert into public.compliance_alerts
        (tenant_id, code, severity, entity_type, entity_id, employee_id, message, data)
      values (v_row.tenant_id, 'CRED_EXPIRED', 'critical', 'staff_credential', v_row.id,
              v_row.employee_id, v_row.full_name || ': ' || v_row.name_en || ' expired',
              jsonb_build_object('expiry_date', v_row.expiry_date, 'type_code', v_row.code))
      on conflict do nothing;
    end if;
  end loop;

  update public.compliance_alerts a
  set resolved_at = now()
  where a.code = 'CRED_EXPIRED' and a.resolved_at is null
    and exists (
      select 1 from public.staff_credentials s
      where s.id = a.entity_id
        and (s.status <> 'verified' or s.expiry_date >= p_today)
    );

  return v_sent;
end;
$$;
revoke execute on function public.credential_status_scan(date) from public, anon, authenticated;

-- CRD-19. Weekly (Monday 06:30 Malaysia time): flags staff below their pro-rated CPD target
-- within 90 days of renewal (CPD_BEHIND alert + one notification per cycle).
create or replace function public.cpd_progress_scan(p_today date default public.malaysia_today())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row record;
  v_flagged integer := 0;
begin
  for v_row in
    select c.*, e.full_name from public.cpd_progress_all(p_today) c
    join public.employees e on e.id = c.employee_id
    where c.on_track = false
      and c.credential_id is not null
      and c.cycle_end - p_today between 0 and 90
  loop
    insert into public.compliance_alerts
      (tenant_id, code, severity, entity_type, entity_id, employee_id, message, data)
    values (v_row.tenant_id, 'CPD_BEHIND', 'warning', 'staff_credential', v_row.credential_id,
            v_row.employee_id, v_row.full_name || ': CPD below target for ' || v_row.name_en,
            jsonb_build_object('points', v_row.points_verified, 'target', v_row.target_to_date,
                               'required', v_row.points_required, 'cycle_end', v_row.cycle_end))
    on conflict do nothing;
    if found then
      perform public.notify_credential_people(v_row.employee_id, 'cpd_behind', jsonb_build_object(
        'type_name_en', v_row.name_en, 'type_name_ms', v_row.name_ms,
        'employee_name', v_row.full_name, 'points', v_row.points_verified,
        'target', v_row.target_to_date, 'required', v_row.points_required,
        'cycle_end', v_row.cycle_end));
      v_flagged := v_flagged + 1;
    end if;
  end loop;

  -- Caught up, or the cycle moved on: resolve.
  update public.compliance_alerts a
  set resolved_at = now()
  where a.code = 'CPD_BEHIND' and a.resolved_at is null
    and not exists (
      select 1 from public.cpd_progress_all(p_today) c
      where c.credential_id = a.entity_id and c.on_track = false
    );
  return v_flagged;
end;
$$;
revoke execute on function public.cpd_progress_scan(date) from public, anon, authenticated;

-- pg_cron runs in UTC: 06:00 MYT = 22:00 UTC the day before; Monday 06:30 MYT = Sunday 22:30 UTC.
select cron.schedule('credential_status_scan', '0 22 * * *', 'select public.credential_status_scan()');
select cron.schedule('cpd_progress_scan', '30 22 * * 0', 'select public.cpd_progress_scan()');
