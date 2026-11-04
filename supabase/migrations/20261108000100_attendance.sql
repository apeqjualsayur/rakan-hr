-- Step 10 (ATT-01 → ATT-05): Employment Act parameters (dated settings), the clinical
-- roster with checks (leave clash, 45 h week, credentials), clock in / out with the branch
-- geofence and an optional selfie, OT requests with calc_ot() (payroll-rules.md §5), weekly
-- hours and monthly OT alerts, and approved OT → payroll_inputs.

-- ── Employment Act parameters (global, dated) ───────────────────────────────────────────
-- payroll-rules.md §5. ⚠ VERIFY: the First Schedule wage threshold for OT / rest-day /
-- holiday pay and the 104-hour monthly OT limit. New values = a new row with a later date.
create table public.employment_act_parameters (
  id uuid primary key default gen_random_uuid(),
  effective_from date not null unique,
  ot_wage_threshold numeric(12, 2) not null check (ot_wage_threshold > 0),
  ot_monthly_limit_hours numeric(6, 2) not null check (ot_monthly_limit_hours > 0),
  normal_weekly_hours numeric(5, 2) not null check (normal_weekly_hours > 0),
  orp_divisor numeric(5, 2) not null check (orp_divisor > 0),
  source text not null,
  created_at timestamptz not null default now()
);
insert into public.employment_act_parameters
  (effective_from, ot_wage_threshold, ot_monthly_limit_hours, normal_weekly_hours, orp_divisor, source)
values ('2023-01-01', 4000.00, 104, 45, 26,
  'Employment Act 1955 (2022 amendments): First Schedule wage threshold RM4,000 (⚠ VERIFY), s60A OT limit 104 h/month (⚠ VERIFY), 45 h week, ORP = monthly wage ÷ 26');

create or replace function public.ea_parameters(p_on date)
returns public.employment_act_parameters
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.employment_act_parameters
  where effective_from <= p_on order by effective_from desc limit 1;
$$;
revoke execute on function public.ea_parameters(date) from public, anon;
grant execute on function public.ea_parameters(date) to authenticated;

-- Company normal hours (company-config.yaml work_pattern), used where a contract has none.
alter table public.tenants
  add column normal_hours_per_day numeric(4, 2) not null default 8
    check (normal_hours_per_day > 0 and normal_hours_per_day <= 24);

-- Contractual OT rule per employee (payroll-rules.md §5): 'auto' = Employment Act rates up
-- to the wage threshold, none above it; 'ea_rates' = the contract gives EA rates anyway;
-- 'none' = no OT pay.
alter table public.employment_records
  add column ot_rule text not null default 'auto' check (ot_rule in ('auto', 'ea_rates', 'none'));

-- ── ATT-02 roster ───────────────────────────────────────────────────────────────────────
create table public.roster_shifts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  branch_id uuid not null references public.branches (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  shift_date date not null,
  start_time time not null,
  end_time time not null,
  break_minutes integer not null default 0 check (break_minutes between 0 and 240),
  room_or_service text check (char_length(room_or_service) <= 80),
  is_on_call boolean not null default false,
  notes text check (char_length(notes) <= 300),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  constraint roster_shifts_times check (end_time > start_time),
  constraint roster_shifts_break check (break_minutes * interval '1 minute' < end_time - start_time)
);
create index roster_shifts_branch_date_idx on public.roster_shifts (branch_id, shift_date);
create index roster_shifts_employee_date_idx on public.roster_shifts (employee_id, shift_date);
create trigger roster_shifts_a_set_tenant
  before insert or update of employee_id on public.roster_shifts
  for each row execute function public.set_tenant_from_employee();
create trigger roster_shifts_set_updated_at before update on public.roster_shifts
  for each row execute function public.set_updated_at();

create or replace function public.shift_hours(p_start time, p_end time, p_break integer)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select round((extract(epoch from (p_end - p_start)) / 3600.0 - coalesce(p_break, 0) / 60.0)::numeric, 2);
$$;

-- ATT-03 checks for one shift (draft or saved): leave on that day, the 45-hour normal week
-- (Monday–Sunday), mandatory credentials not valid on that date (as of the shift date, so
-- an expiry before it counts), and work on a rest day or public holiday (paid as OT).
-- Credentials block only when the company enforces hard and the role's requirement
-- blocks_roster; everything else is a warning.
create or replace function public.roster_issues(
  p_employee_id uuid,
  p_date date,
  p_start time,
  p_end time,
  p_break integer,
  p_exclude_shift uuid default null
)
returns table (code text, severity text, detail jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_employee public.employees;
  v_tenant public.tenants;
  v_week_start date := p_date - ((extract(isodow from p_date)::int) - 1);
  v_hours numeric;
  v_cap numeric := (public.ea_parameters(p_date)).normal_weekly_hours;
begin
  select * into v_employee from public.employees where id = p_employee_id;
  select * into v_tenant from public.tenants where id = v_employee.tenant_id;

  return query
    select 'LEAVE'::text, 'warning'::text,
           jsonb_build_object('status', r.status, 'type_en', t.name_en, 'type_ms', t.name_ms,
                              'half_day', r.half_day)
    from public.leave_requests r join public.leave_types t on t.id = r.leave_type_id
    where r.employee_id = p_employee_id and r.status in ('pending', 'approved')
      and p_date between r.start_date and r.end_date;

  select coalesce(sum(public.shift_hours(s.start_time, s.end_time, s.break_minutes)), 0)
       + public.shift_hours(p_start, p_end, p_break)
  into v_hours
  from public.roster_shifts s
  where s.employee_id = p_employee_id
    and s.shift_date between v_week_start and v_week_start + 6
    and s.id is distinct from p_exclude_shift
    and not s.is_on_call;
  if v_hours > v_cap then
    return query select 'WEEK_HOURS'::text, 'warning'::text,
      jsonb_build_object('hours', v_hours, 'cap', v_cap, 'week_start', v_week_start);
  end if;

  return query
    select 'CREDENTIAL'::text,
           case when v_tenant.credential_enforcement = 'hard' and c.blocks_roster then 'block' else 'warning' end,
           jsonb_build_object('type_en', c.name_en, 'type_ms', c.name_ms, 'status', c.display_status,
                              'expiry_date', c.expiry_date)
    from public.credential_status_rows_all(p_date) c
    where c.employee_id = p_employee_id and c.requirement = 'mandatory'
      and c.display_status in ('expired', 'missing', 'rejected', 'pending', 'upcoming');

  if extract(dow from p_date)::smallint = v_tenant.rest_day then
    return query select 'REST_DAY'::text, 'warning'::text, '{}'::jsonb;
  end if;
  return query
    select 'HOLIDAY'::text, 'warning'::text, jsonb_build_object('name_en', h.name_en, 'name_ms', h.name_ms)
    from public.holiday_calendar(v_tenant.id, public.employee_state_code(p_employee_id), p_date, p_date) h
    limit 1;
end;
$$;
revoke execute on function public.roster_issues(uuid, date, time, time, integer, uuid) from public, anon, authenticated;

-- Who may build the roster for someone: owner / HR admin, or a manager of their branch.
create or replace function public.can_roster(p_employee_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.employees e
    where e.id = p_employee_id and e.tenant_id = public.auth_tenant_id()
      and (public.auth_role() in ('owner', 'hr_admin') or public.is_manager_of(e.id))
  );
$$;
revoke execute on function public.can_roster(uuid) from public, anon;
grant execute on function public.can_roster(uuid) to authenticated;

-- Shifts stay inside the company, never overlap the same person's other shift, and are
-- refused when a blocking credential problem applies (hard enforcement).
create or replace function public.roster_shifts_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.branches b where b.id = new.branch_id and b.tenant_id = new.tenant_id) then
    raise exception 'Branch belongs to another company' using errcode = '23503';
  end if;
  if exists (
    select 1 from public.roster_shifts s
    where s.employee_id = new.employee_id and s.shift_date = new.shift_date and s.id <> new.id
      and s.start_time < new.end_time and new.start_time < s.end_time
  ) then
    raise exception 'This overlaps another shift for the same person' using errcode = '23514',
      hint = 'shift_overlap';
  end if;
  if exists (
    select 1 from public.roster_issues(new.employee_id, new.shift_date, new.start_time, new.end_time,
                                       new.break_minutes, new.id) i
    where i.severity = 'block'
  ) then
    raise exception 'A required credential is not valid on this date' using errcode = '23514',
      hint = 'credential_block';
  end if;
  return new;
end;
$$;
create trigger roster_shifts_before_write
  before insert or update of employee_id, shift_date, start_time, end_time, break_minutes
  on public.roster_shifts
  for each row execute function public.roster_shifts_before_write();

-- The issues for every shift of a branch's week, for the roster builder.
create or replace function public.roster_week_issues(p_branch_id uuid, p_week_start date)
returns table (shift_id uuid, code text, severity text, detail jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, i.code, i.severity, i.detail
  from public.roster_shifts s
  cross join lateral public.roster_issues(s.employee_id, s.shift_date, s.start_time, s.end_time,
                                          s.break_minutes, s.id) i
  where s.branch_id = p_branch_id
    and s.tenant_id = public.auth_tenant_id()
    and s.shift_date between p_week_start and p_week_start + 6
    and public.can_roster(s.employee_id);
$$;
revoke execute on function public.roster_week_issues(uuid, date) from public, anon;
grant execute on function public.roster_week_issues(uuid, date) to authenticated;

-- Checks for a shift before it is saved (the builder's form).
create or replace function public.check_shift(
  p_employee_id uuid, p_date date, p_start time, p_end time, p_break integer, p_shift_id uuid default null
)
returns table (code text, severity text, detail jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select i.* from public.roster_issues(p_employee_id, p_date, p_start, p_end, p_break, p_shift_id) i
  where public.can_roster(p_employee_id);
$$;
revoke execute on function public.check_shift(uuid, date, time, time, integer, uuid) from public, anon;
grant execute on function public.check_shift(uuid, date, time, time, integer, uuid) to authenticated;

-- "Copy last week": last week's shifts for the branch become drafts this week, except where
-- the person already has a shift that day, has left, or a blocking check refuses it.
create or replace function public.copy_roster_week(p_branch_id uuid, p_week_start date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shift public.roster_shifts;
  v_count integer := 0;
begin
  for v_shift in
    select s.* from public.roster_shifts s
    join public.employees e on e.id = s.employee_id
    where s.branch_id = p_branch_id and s.tenant_id = public.auth_tenant_id()
      and s.shift_date between p_week_start - 7 and p_week_start - 1
      and e.status in ('active', 'on_notice') and e.deleted_at is null
      and public.can_roster(s.employee_id)
      and not exists (select 1 from public.roster_shifts t
                      where t.employee_id = s.employee_id and t.shift_date = s.shift_date + 7)
  loop
    begin
      insert into public.roster_shifts (branch_id, employee_id, shift_date, start_time, end_time,
        break_minutes, room_or_service, is_on_call, notes)
      values (v_shift.branch_id, v_shift.employee_id, v_shift.shift_date + 7, v_shift.start_time,
        v_shift.end_time, v_shift.break_minutes, v_shift.room_or_service, v_shift.is_on_call, v_shift.notes);
      v_count := v_count + 1;
    exception when check_violation then
      null; -- e.g. a credential now blocks this person; left for the roster builder
    end;
  end loop;
  return v_count;
end;
$$;
revoke execute on function public.copy_roster_week(uuid, date) from public, anon;
grant execute on function public.copy_roster_week(uuid, date) to authenticated;

-- Publish a branch's week: staff can now see their shifts and each is told once.
create or replace function public.publish_roster(p_branch_id uuid, p_week_start date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_employee uuid;
  v_user uuid;
  v_count integer := 0;
begin
  for v_employee in
    with published as (
      update public.roster_shifts s set published_at = now()
      where s.branch_id = p_branch_id and s.tenant_id = public.auth_tenant_id()
        and s.shift_date between p_week_start and p_week_start + 6
        and s.published_at is null and public.can_roster(s.employee_id)
      returning s.employee_id
    )
    select distinct employee_id from published
  loop
    for v_user in
      select m.user_id from public.memberships m
      where m.employee_id = v_employee and m.is_active and m.user_id is not null
    loop
      perform public.notify(v_user, 'roster_published', jsonb_build_object('week_start', p_week_start), '/staff/time');
    end loop;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
revoke execute on function public.publish_roster(uuid, date) from public, anon;
grant execute on function public.publish_roster(uuid, date) to authenticated;

-- ── ATT-01 geofence and attendance ──────────────────────────────────────────────────────
-- Great-circle distance in metres (haversine).
create or replace function public.geo_distance_m(p_lat1 numeric, p_lng1 numeric, p_lat2 numeric, p_lng2 numeric)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select round((2 * 6371000 * asin(sqrt(
    power(sin(radians(p_lat2 - p_lat1) / 2), 2)
    + cos(radians(p_lat1)) * cos(radians(p_lat2)) * power(sin(radians(p_lng2 - p_lng1) / 2), 2)
  )))::numeric, 1);
$$;

-- Inside a branch's fence? Null when the branch has no fence set (then nobody is asked).
create or replace function public.geofence_check(p_branch_id uuid, p_lat numeric, p_lng numeric)
returns table (distance_m numeric, radius_m integer, inside boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select case when b.geo_lat is null or p_lat is null then null
              else public.geo_distance_m(b.geo_lat, b.geo_lng, p_lat, p_lng) end,
         coalesce(b.geo_radius_m, 100),
         case when b.geo_lat is null then null
              when p_lat is null then false
              else public.geo_distance_m(b.geo_lat, b.geo_lng, p_lat, p_lng) <= coalesce(b.geo_radius_m, 100) end
  from public.branches b
  where b.id = p_branch_id and b.tenant_id = public.auth_tenant_id();
$$;
revoke execute on function public.geofence_check(uuid, numeric, numeric) from public, anon;
grant execute on function public.geofence_check(uuid, numeric, numeric) to authenticated;

-- 🔒 Never deleted (6-year retention).
create table public.attendance_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  branch_id uuid references public.branches (id) on delete set null,
  shift_id uuid references public.roster_shifts (id) on delete set null,
  work_date date not null,
  clock_in_at timestamptz not null,
  clock_out_at timestamptz,
  in_lat numeric(9, 6),
  in_lng numeric(9, 6),
  in_accuracy_m numeric(8, 1),
  out_lat numeric(9, 6),
  out_lng numeric(9, 6),
  out_accuracy_m numeric(8, 1),
  within_geofence boolean,
  out_within_geofence boolean,
  outside_reason text check (char_length(outside_reason) <= 300),
  out_outside_reason text check (char_length(out_outside_reason) <= 300),
  selfie_path text,
  source text not null default 'pwa' check (source in ('pwa', 'manual')),
  manual_reason text check (char_length(manual_reason) <= 300),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  constraint attendance_logs_out_after_in check (clock_out_at > clock_in_at)
);
create index attendance_logs_employee_idx on public.attendance_logs (employee_id, work_date desc);
create index attendance_logs_tenant_date_idx on public.attendance_logs (tenant_id, work_date);
create unique index attendance_logs_one_open on public.attendance_logs (employee_id)
  where clock_out_at is null and deleted_at is null;
create trigger attendance_logs_a_set_tenant
  before insert or update of employee_id on public.attendance_logs
  for each row execute function public.set_tenant_from_employee();
create trigger attendance_logs_set_updated_at before update on public.attendance_logs
  for each row execute function public.set_updated_at();
select audit.enable('public.attendance_logs');

-- Today's published shift for the signed-in employee (Malaysia date), and where they clock.
create or replace function public.my_today()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'shift', (
      select jsonb_build_object('id', s.id, 'branch_id', s.branch_id, 'start_time', s.start_time,
        'end_time', s.end_time, 'room_or_service', s.room_or_service, 'is_on_call', s.is_on_call,
        'branch_name', b.name)
      from public.roster_shifts s join public.branches b on b.id = s.branch_id
      where s.employee_id = e.id and s.shift_date = public.malaysia_today() and s.published_at is not null
      order by s.start_time limit 1),
    'open', (
      select jsonb_build_object('id', a.id, 'clock_in_at', a.clock_in_at, 'within_geofence', a.within_geofence)
      from public.attendance_logs a
      where a.employee_id = e.id and a.clock_out_at is null and a.deleted_at is null),
    'last', (
      select jsonb_build_object('clock_in_at', a.clock_in_at, 'clock_out_at', a.clock_out_at)
      from public.attendance_logs a
      where a.employee_id = e.id and a.work_date = public.malaysia_today() and a.deleted_at is null
      order by a.clock_in_at desc limit 1),
    'branch', (
      select jsonb_build_object('id', b.id, 'name', b.name, 'has_fence', b.geo_lat is not null,
        'radius_m', coalesce(b.geo_radius_m, 100))
      from public.branches b
      where b.id = coalesce((select s.branch_id from public.roster_shifts s
                             where s.employee_id = e.id and s.shift_date = public.malaysia_today()
                               and s.published_at is not null order by s.start_time limit 1), e.branch_id))
  )
  from public.employees e
  where e.id = public.auth_employee_id();
$$;
revoke execute on function public.my_today() from public, anon;
grant execute on function public.my_today() to authenticated;

-- ATT-01 clock in: the branch of today's shift (else the employee's branch); outside the
-- fence (or with no location) is allowed with a reason. One open clock-in at a time.
create or replace function public.clock_in(
  p_lat numeric,
  p_lng numeric,
  p_accuracy numeric,
  p_reason text default null,
  p_selfie_path text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_employee public.employees;
  v_today date := public.malaysia_today();
  v_shift public.roster_shifts;
  v_branch uuid;
  v_inside boolean;
  v_id uuid;
begin
  select * into v_employee from public.employees
  where id = public.auth_employee_id() and status in ('active', 'on_notice') and deleted_at is null;
  if not found then
    raise exception 'Your account is not linked to an employee record' using errcode = '42501', hint = 'not_linked';
  end if;
  select * into v_shift from public.roster_shifts s
  where s.employee_id = v_employee.id and s.shift_date = v_today and s.published_at is not null
  order by s.start_time limit 1;
  v_branch := coalesce(v_shift.branch_id, v_employee.branch_id);
  select g.inside into v_inside from public.geofence_check(v_branch, p_lat, p_lng) g;
  if v_inside is false and btrim(coalesce(p_reason, '')) = '' then
    raise exception 'You are outside the centre: give a reason' using errcode = '22023', hint = 'reason_required';
  end if;
  if p_selfie_path is not null and (storage.foldername(p_selfie_path))[2] is distinct from v_employee.id::text then
    raise exception 'Bad selfie path' using errcode = '22023';
  end if;
  insert into public.attendance_logs (employee_id, branch_id, shift_id, work_date, clock_in_at, in_lat,
    in_lng, in_accuracy_m, within_geofence, outside_reason, selfie_path, source)
  values (v_employee.id, v_branch, v_shift.id, v_today, now(), p_lat, p_lng, p_accuracy, v_inside,
    case when v_inside is false then btrim(p_reason) end, p_selfie_path, 'pwa')
  returning id into v_id;
  return v_id;
exception
  when unique_violation then
    raise exception 'You are already clocked in' using errcode = '23505', hint = 'already_clocked_in';
end;
$$;
revoke execute on function public.clock_in(numeric, numeric, numeric, text, text) from public, anon;
grant execute on function public.clock_in(numeric, numeric, numeric, text, text) to authenticated;

create or replace function public.clock_out(
  p_lat numeric,
  p_lng numeric,
  p_accuracy numeric,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_log public.attendance_logs;
  v_inside boolean;
begin
  select * into v_log from public.attendance_logs
  where employee_id = public.auth_employee_id() and clock_out_at is null and deleted_at is null
  for update;
  if not found then
    raise exception 'You are not clocked in' using errcode = '22023', hint = 'not_clocked_in';
  end if;
  select g.inside into v_inside from public.geofence_check(v_log.branch_id, p_lat, p_lng) g;
  if v_inside is false and btrim(coalesce(p_reason, '')) = '' then
    raise exception 'You are outside the centre: give a reason' using errcode = '22023', hint = 'reason_required';
  end if;
  update public.attendance_logs
  set clock_out_at = greatest(now(), clock_in_at + interval '1 second'), out_lat = p_lat, out_lng = p_lng,
      out_accuracy_m = p_accuracy, out_within_geofence = v_inside,
      out_outside_reason = case when v_inside is false then btrim(p_reason) end
  where id = v_log.id;
  return v_log.id;
end;
$$;
revoke execute on function public.clock_out(numeric, numeric, numeric, text) from public, anon;
grant execute on function public.clock_out(numeric, numeric, numeric, text) to authenticated;

-- HR records or corrects attendance by hand (forgotten clock-out, no phone), with a reason.
create or replace function public.record_attendance(
  p_employee_id uuid,
  p_clock_in_at timestamptz,
  p_clock_out_at timestamptz,
  p_reason text,
  p_log_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_employee public.employees;
  v_id uuid;
begin
  if public.auth_role() is null or public.auth_role() not in ('owner', 'hr_admin') then
    raise exception 'Only the owner or HR admin can record attendance' using errcode = '42501';
  end if;
  if btrim(coalesce(p_reason, '')) = '' then
    raise exception 'Give a reason' using errcode = '22023', hint = 'reason_required';
  end if;
  select * into v_employee from public.employees where id = p_employee_id and tenant_id = public.auth_tenant_id();
  if not found then
    raise exception 'Employee not found' using errcode = 'P0002';
  end if;
  if p_log_id is not null then
    update public.attendance_logs
    set clock_in_at = p_clock_in_at, clock_out_at = p_clock_out_at,
        work_date = (p_clock_in_at at time zone 'Asia/Kuala_Lumpur')::date,
        source = 'manual', manual_reason = btrim(p_reason)
    where id = p_log_id and employee_id = p_employee_id and deleted_at is null
    returning id into v_id;
    if v_id is null then
      raise exception 'Attendance not found' using errcode = 'P0002';
    end if;
    return v_id;
  end if;
  insert into public.attendance_logs (employee_id, branch_id, work_date, clock_in_at, clock_out_at, source, manual_reason)
  values (p_employee_id, v_employee.branch_id, (p_clock_in_at at time zone 'Asia/Kuala_Lumpur')::date,
    p_clock_in_at, p_clock_out_at, 'manual', btrim(p_reason))
  returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.record_attendance(uuid, timestamptz, timestamptz, text, uuid) from public, anon;
grant execute on function public.record_attendance(uuid, timestamptz, timestamptz, text, uuid) to authenticated;

-- ── ATT-04 overtime ─────────────────────────────────────────────────────────────────────
-- The kind of day for someone: a public holiday (incl. replacement days) of their state,
-- the company rest day, else a normal day. Off days of a 5-day week count as normal days,
-- so all hours worked there are OT at the normal-day rate (⚠ VERIFY with the accountant).
create or replace function public.ot_day_type(p_employee_id uuid, p_date date)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when exists (select 1 from public.holiday_calendar(e.tenant_id, public.employee_state_code(e.id), p_date, p_date))
      then 'public_holiday'
    when extract(dow from p_date)::smallint = t.rest_day then 'rest_day'
    else 'normal' end
  from public.employees e join public.tenants t on t.id = e.tenant_id
  where e.id = p_employee_id;
$$;
revoke execute on function public.ot_day_type(uuid, date) from public, anon, authenticated;

-- calc_ot() — payroll-rules.md §5, Employment Act 1955:
--   ORP (daily) = monthly wage ÷ 26 (hourly-rated: hourly rate × normal hours)
--   HRP = ORP ÷ normal hours per day (hourly-rated: the hourly rate)
--   normal day:      OT hours × 1.5 × HRP
--   rest day:        up to half the normal hours 0.5 × ORP; more, up to the normal hours
--                    1 × ORP; each hour beyond the normal hours 2 × HRP
--   public holiday:  work within the normal hours 2 × ORP (on top of holiday pay);
--                    each hour beyond the normal hours 3 × HRP
-- p_hours: OT hours beyond the normal hours on a normal day; all hours worked on a rest day
-- or public holiday. These rates apply up to the wage threshold in employment_act_parameters
-- (First Schedule); above it the contract decides (employment_records.ot_rule). Per-session
-- pay has no ORP in the Act: OT is then entered by hand. Amounts are rounded to sen once,
-- at the end.
create or replace function public.calc_ot(
  p_employee_id uuid,
  p_work_date date,
  p_day_type text,
  p_hours numeric
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_record public.employment_records;
  v_params public.employment_act_parameters := public.ea_parameters(p_work_date);
  v_normal numeric;
  v_wage numeric;
  v_orp numeric;
  v_hrp numeric;
  v_method text;
  v_within numeric;
  v_beyond numeric;
  v_lines jsonb := '[]'::jsonb;
  v_amount numeric := 0;
begin
  if p_day_type not in ('normal', 'rest_day', 'public_holiday') or p_hours is null or p_hours <= 0 then
    raise exception 'Bad OT input' using errcode = '22023';
  end if;
  select r.* into v_record from public.employment_records r
  where r.employee_id = p_employee_id and r.start_date <= p_work_date
    and (r.end_date is null or r.end_date >= p_work_date)
  order by r.start_date desc limit 1;
  if v_record.id is null then
    select r.* into v_record from public.employment_records r
    where r.employee_id = p_employee_id and r.is_current;
  end if;
  if v_record.id is null then
    return jsonb_build_object('covered', false, 'method', 'manual', 'reason', 'no_contract', 'amount', null);
  end if;
  v_normal := coalesce(v_record.normal_hours_per_day,
    (select t.normal_hours_per_day from public.tenants t where t.id = v_record.tenant_id));

  if v_record.pay_model = 'monthly' then
    v_wage := v_record.basic_salary;
    v_orp := v_record.basic_salary / v_params.orp_divisor;
    v_hrp := v_orp / v_normal;
  elsif v_record.pay_model = 'hourly' then
    v_wage := v_record.hourly_rate * v_normal * v_params.orp_divisor;
    v_orp := v_record.hourly_rate * v_normal;
    v_hrp := v_record.hourly_rate;
  else
    return jsonb_build_object('covered', false, 'method', 'manual', 'reason', 'per_session', 'amount', null);
  end if;

  v_method := case v_record.ot_rule
    when 'none' then 'none'
    when 'ea_rates' then 'ea'
    else case when v_wage <= v_params.ot_wage_threshold then 'ea' else 'contract' end
  end;
  if v_method <> 'ea' then
    return jsonb_build_object('covered', false, 'method', v_method, 'monthly_wage', v_wage,
      'threshold', v_params.ot_wage_threshold, 'orp', round(v_orp, 4), 'hrp', round(v_hrp, 4),
      'normal_hours', v_normal, 'lines', '[]'::jsonb, 'amount', 0);
  end if;

  if p_day_type = 'normal' then
    v_lines := jsonb_build_array(jsonb_build_object('rule', 'normal_ot', 'hours', p_hours,
      'multiplier', 1.5, 'basis', 'hrp', 'amount', p_hours * 1.5 * v_hrp));
  else
    v_within := least(p_hours, v_normal);
    v_beyond := greatest(p_hours - v_normal, 0);
    if p_day_type = 'rest_day' then
      v_lines := jsonb_build_array(
        case when v_within <= v_normal / 2
          then jsonb_build_object('rule', 'rest_day_half', 'hours', v_within, 'multiplier', 0.5,
                                  'basis', 'orp', 'amount', 0.5 * v_orp)
          else jsonb_build_object('rule', 'rest_day_full', 'hours', v_within, 'multiplier', 1,
                                  'basis', 'orp', 'amount', v_orp) end);
      if v_beyond > 0 then
        v_lines := v_lines || jsonb_build_object('rule', 'rest_day_ot', 'hours', v_beyond,
          'multiplier', 2, 'basis', 'hrp', 'amount', v_beyond * 2 * v_hrp);
      end if;
    else
      v_lines := jsonb_build_array(jsonb_build_object('rule', 'holiday_normal', 'hours', v_within,
        'multiplier', 2, 'basis', 'orp', 'amount', 2 * v_orp));
      if v_beyond > 0 then
        v_lines := v_lines || jsonb_build_object('rule', 'holiday_ot', 'hours', v_beyond,
          'multiplier', 3, 'basis', 'hrp', 'amount', v_beyond * 3 * v_hrp);
      end if;
    end if;
  end if;
  select sum((l ->> 'amount')::numeric) into v_amount from jsonb_array_elements(v_lines) l;
  return jsonb_build_object('covered', true, 'method', 'ea', 'monthly_wage', v_wage,
    'threshold', v_params.ot_wage_threshold, 'orp', round(v_orp, 4), 'hrp', round(v_hrp, 4),
    'normal_hours', v_normal, 'lines', v_lines, 'amount', round(v_amount, 2));
end;
$$;
revoke execute on function public.calc_ot(uuid, date, text, numeric) from public, anon, authenticated;

-- 🔒 Never deleted; cancelled instead.
create table public.ot_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  work_date date not null,
  day_type text not null check (day_type in ('normal', 'rest_day', 'public_holiday')),
  hours numeric(5, 2) not null check (hours > 0 and hours <= 24),
  reason text check (char_length(reason) <= 500),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  approval_id uuid references public.approvals (id) on delete set null,
  calculated_amount numeric(12, 2),
  calculation jsonb,
  decided_at timestamptz,
  decided_by uuid references auth.users (id) on delete set null,
  decision_comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create index ot_requests_employee_idx on public.ot_requests (employee_id, work_date desc);
create index ot_requests_tenant_idx on public.ot_requests (tenant_id, status, work_date);
create trigger ot_requests_a_set_tenant
  before insert or update of employee_id on public.ot_requests
  for each row execute function public.set_tenant_from_employee();
create trigger ot_requests_set_updated_at before update on public.ot_requests
  for each row execute function public.set_updated_at();
select audit.enable('public.ot_requests');

-- What an OT request would pay, for the form (own, or anyone for HR / their manager).
create or replace function public.preview_ot(p_work_date date, p_hours numeric, p_employee_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_employee uuid := coalesce(p_employee_id, public.auth_employee_id());
  v_day text;
begin
  if v_employee is null or not public.can_see_leave_of(v_employee) or p_hours is null or p_hours <= 0 then
    return null;
  end if;
  v_day := public.ot_day_type(v_employee, p_work_date);
  return public.calc_ot(v_employee, p_work_date, v_day, p_hours) || jsonb_build_object('day_type', v_day,
    'month_hours', (select coalesce(sum(o.hours), 0) from public.ot_requests o
                    where o.employee_id = v_employee and o.status = 'approved'
                      and date_trunc('month', o.work_date) = date_trunc('month', p_work_date)),
    'month_limit', (public.ea_parameters(p_work_date)).ot_monthly_limit_hours);
end;
$$;
revoke execute on function public.preview_ot(date, numeric, uuid) from public, anon;
grant execute on function public.preview_ot(date, numeric, uuid) to authenticated;

-- Approved OT: the amount is fixed from calc_ot(), it becomes a payroll input for its
-- month, and going over the monthly OT limit raises an alert for HR (flag, not block).
create or replace function public.ot_after_approval(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.ot_requests;
  v_calc jsonb;
  v_month_hours numeric;
  v_limit numeric;
  v_name text;
begin
  select * into v_request from public.ot_requests where id = p_request_id;
  v_calc := public.calc_ot(v_request.employee_id, v_request.work_date, v_request.day_type, v_request.hours);
  update public.ot_requests
  set calculation = v_calc, calculated_amount = (v_calc ->> 'amount')::numeric
  where id = v_request.id;
  insert into public.payroll_inputs (employee_id, period_month, pay_item_code, quantity, amount, source,
    source_id, description, created_by)
  values (v_request.employee_id, date_trunc('month', v_request.work_date)::date,
    'OT_' || upper(v_request.day_type), v_request.hours, (v_calc ->> 'amount')::numeric, 'attendance',
    v_request.id, 'Overtime ' || v_request.work_date || ' (' || replace(v_request.day_type, '_', ' ') || ')', null);

  select coalesce(sum(o.hours), 0) into v_month_hours from public.ot_requests o
  where o.employee_id = v_request.employee_id and o.status = 'approved'
    and date_trunc('month', o.work_date) = date_trunc('month', v_request.work_date);
  v_limit := (public.ea_parameters(v_request.work_date)).ot_monthly_limit_hours;
  if v_month_hours > v_limit then
    select full_name into v_name from public.employees where id = v_request.employee_id;
    insert into public.compliance_alerts (tenant_id, code, severity, entity_type, entity_id, employee_id, message, data)
    values (v_request.tenant_id, 'OT_MONTHLY_LIMIT', 'warning', 'employee_month',
      md5(v_request.employee_id::text || to_char(v_request.work_date, 'YYYY-MM'))::uuid, v_request.employee_id,
      v_name || ': ' || v_month_hours || ' OT hours in ' || to_char(v_request.work_date, 'Mon YYYY'),
      jsonb_build_object('hours', v_month_hours, 'limit', v_limit, 'month', to_char(v_request.work_date, 'YYYY-MM')))
    on conflict (code, entity_id) where resolved_at is null
    do update set data = excluded.data, message = excluded.message;
    perform public.notify_hiring_team(v_request.tenant_id, 'ot_limit_exceeded',
      jsonb_build_object('employee_name', v_name, 'hours', v_month_hours, 'limit', v_limit,
                         'month', to_char(v_request.work_date, 'YYYY-MM')),
      '/admin/time/overtime');
  end if;
end;
$$;
revoke execute on function public.ot_after_approval(uuid) from public, anon, authenticated;

-- Staff ask for OT on a day (before or after); the manager approves. The owner / HR
-- admin can record approved OT for anyone.
create or replace function public.request_ot(
  p_work_date date,
  p_hours numeric,
  p_reason text,
  p_employee_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin boolean := public.auth_role() in ('owner', 'hr_admin');
  v_employee_id uuid := coalesce(p_employee_id, public.auth_employee_id());
  v_employee public.employees;
  v_id uuid;
  v_on_behalf boolean;
begin
  if v_employee_id is null then
    raise exception 'Your account is not linked to an employee record' using errcode = '42501', hint = 'not_linked';
  end if;
  v_on_behalf := v_employee_id is distinct from public.auth_employee_id();
  if v_on_behalf and not v_admin then
    raise exception 'Only HR can record OT for someone else' using errcode = '42501';
  end if;
  select * into v_employee from public.employees
  where id = v_employee_id and tenant_id = public.auth_tenant_id() and status in ('active', 'on_notice')
    and deleted_at is null;
  if not found then
    raise exception 'Employee not found' using errcode = 'P0002';
  end if;
  if p_hours is null or p_hours <= 0 or p_hours > 24 then
    raise exception 'Hours must be between 0 and 24' using errcode = '22023', hint = 'bad_hours';
  end if;
  if not exists (select 1 from public.employee_service(v_employee_id) s
                 where s.service_start <= p_work_date and (s.service_end is null or s.service_end >= p_work_date)) then
    raise exception 'Outside the employment dates' using errcode = '22023', hint = 'outside_employment';
  end if;
  if exists (select 1 from public.ot_requests o
             where o.employee_id = v_employee_id and o.work_date = p_work_date and o.status in ('pending', 'approved')) then
    raise exception 'There is already OT for this day' using errcode = '22023', hint = 'ot_exists';
  end if;
  insert into public.ot_requests (employee_id, work_date, day_type, hours, reason, status, decided_at, decided_by)
  values (v_employee_id, p_work_date, public.ot_day_type(v_employee_id, p_work_date), p_hours,
    nullif(btrim(p_reason), ''),
    case when v_on_behalf then 'approved' else 'pending' end,
    case when v_on_behalf then now() end, case when v_on_behalf then auth.uid() end)
  returning id into v_id;
  if v_on_behalf then
    perform public.ot_after_approval(v_id);
  else
    update public.ot_requests
    set approval_id = public.create_approval('overtime', v_id, public.leave_approval_steps(v_employee_id))
    where id = v_id;
  end if;
  return v_id;
end;
$$;
revoke execute on function public.request_ot(date, numeric, text, uuid) from public, anon;
grant execute on function public.request_ot(date, numeric, text, uuid) to authenticated;

create or replace function public.ot_on_approval_decided()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.ot_requests;
  v_comment text;
begin
  select * into v_request from public.ot_requests
  where id = new.entity_id and approval_id = new.id and status = 'pending'
  for update;
  if not found then
    return null;
  end if;
  select s.comment into v_comment from public.approval_steps s
  where s.approval_id = new.id order by s.step_no desc limit 1;
  update public.ot_requests
  set status = case new.status when 'approved' then 'approved' when 'rejected' then 'rejected' else 'cancelled' end,
      decided_at = now(), decided_by = auth.uid(), decision_comment = v_comment
  where id = v_request.id;
  if new.status = 'approved' then
    perform public.ot_after_approval(v_request.id);
  end if;
  return null;
end;
$$;
create trigger approvals_ot_decided
  after update of status on public.approvals
  for each row
  when (new.entity_type = 'overtime' and old.status = 'pending' and new.status <> 'pending')
  execute function public.ot_on_approval_decided();

-- Staff cancel their own pending OT; the owner / HR admin also approved OT not yet paid.
create or replace function public.cancel_ot(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.ot_requests;
  v_admin boolean := public.auth_role() in ('owner', 'hr_admin');
begin
  select * into v_request from public.ot_requests
  where id = p_request_id and tenant_id = public.auth_tenant_id()
  for update;
  if not found or not (v_request.employee_id = public.auth_employee_id() or v_admin) then
    raise exception 'OT not found' using errcode = 'P0002';
  end if;
  if v_request.status = 'approved' and not v_admin then
    raise exception 'Ask HR to cancel approved OT' using errcode = '42501', hint = 'ask_hr';
  end if;
  if v_request.status not in ('pending', 'approved') then
    raise exception 'This OT is already closed' using errcode = '22023', hint = 'not_open';
  end if;
  if exists (select 1 from public.payroll_inputs p
             where p.source = 'attendance' and p.source_id = v_request.id and p.payroll_run_id is not null) then
    raise exception 'This OT is already in a payroll run' using errcode = '22023', hint = 'in_payroll';
  end if;
  update public.ot_requests set status = 'cancelled', decided_at = now(), decided_by = auth.uid()
  where id = v_request.id;
  update public.approvals set status = 'cancelled', decided_at = now()
  where id = v_request.approval_id and status = 'pending';
  delete from public.payroll_inputs where source = 'attendance' and source_id = v_request.id;
end;
$$;
revoke execute on function public.cancel_ot(uuid) from public, anon;
grant execute on function public.cancel_ot(uuid) to authenticated;

-- ── ATT-05 alerts: more than the normal weekly hours ────────────────────────────────────
-- Monday 07:15 MYT for the week just ended: hours clocked (less the shift's break) above
-- the normal weekly hours raise an alert and tell HR (flag, not block; OT is separate).
create or replace function public.attendance_hours_scan(p_today date default public.malaysia_today())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_week_start date := p_today - ((extract(isodow from p_today)::int) - 1) - 7;
  v_row record;
  v_count integer := 0;
begin
  for v_row in
    select a.tenant_id, a.employee_id, e.full_name,
           round(sum(extract(epoch from (a.clock_out_at - a.clock_in_at)) / 3600.0
                     - coalesce(s.break_minutes, 0) / 60.0)::numeric, 2) as hours,
           (public.ea_parameters(v_week_start)).normal_weekly_hours as cap
    from public.attendance_logs a
    join public.employees e on e.id = a.employee_id
    left join public.roster_shifts s on s.id = a.shift_id
    where a.deleted_at is null and a.clock_out_at is not null
      and a.work_date between v_week_start and v_week_start + 6
    group by a.tenant_id, a.employee_id, e.full_name
  loop
    if v_row.hours > v_row.cap then
      insert into public.compliance_alerts (tenant_id, code, severity, entity_type, entity_id, employee_id, message, data)
      values (v_row.tenant_id, 'WEEKLY_HOURS', 'warning', 'employee_week',
        md5(v_row.employee_id::text || v_week_start::text)::uuid, v_row.employee_id,
        v_row.full_name || ': ' || v_row.hours || ' hours in the week of ' || v_week_start,
        jsonb_build_object('hours', v_row.hours, 'cap', v_row.cap, 'week_start', v_week_start))
      on conflict (code, entity_id) where resolved_at is null do nothing;
      if found then
        perform public.notify_hiring_team(v_row.tenant_id, 'weekly_hours_exceeded',
          jsonb_build_object('employee_name', v_row.full_name, 'hours', v_row.hours, 'cap', v_row.cap,
                             'week_start', v_week_start),
          '/admin/time/attendance');
        v_count := v_count + 1;
      end if;
    end if;
  end loop;
  return v_count;
end;
$$;
revoke execute on function public.attendance_hours_scan(date) from public, anon, authenticated;
-- Monday 07:15 MYT = Sunday 23:15 UTC.
select cron.schedule('attendance_hours_scan', '15 23 * * 0', 'select public.attendance_hours_scan()');

-- ── RLS (data-model.md §5: attendance — own insert/read, team read, HR full, auditor read)
alter table public.employment_act_parameters enable row level security;
alter table public.roster_shifts enable row level security;
alter table public.attendance_logs enable row level security;
alter table public.ot_requests enable row level security;
revoke all on public.employment_act_parameters, public.roster_shifts, public.attendance_logs,
  public.ot_requests from anon;

create policy employment_act_parameters_select on public.employment_act_parameters
  for select to authenticated using (true);
revoke insert, update, delete, truncate on public.employment_act_parameters from authenticated;

-- Roster: builders (owner, HR, managers of the branch) see and change drafts; everyone else
-- sees published shifts of their own; payroll approver and auditor read.
create policy roster_shifts_select on public.roster_shifts for select to authenticated
  using (
    tenant_id = public.auth_tenant_id()
    and (
      public.auth_role() in ('owner', 'hr_admin', 'payroll_approver', 'auditor')
      or public.can_roster(employee_id)
      or (employee_id = public.auth_employee_id() and published_at is not null)
    )
  );
create policy roster_shifts_insert on public.roster_shifts for insert to authenticated
  with check (public.can_roster(employee_id));
create policy roster_shifts_update on public.roster_shifts for update to authenticated
  using (tenant_id = public.auth_tenant_id() and public.can_roster(employee_id))
  with check (public.can_roster(employee_id));
create policy roster_shifts_delete on public.roster_shifts for delete to authenticated
  using (tenant_id = public.auth_tenant_id() and public.can_roster(employee_id));
revoke update (published_at) on public.roster_shifts from authenticated;

create policy attendance_logs_select on public.attendance_logs for select to authenticated
  using (tenant_id = public.auth_tenant_id() and public.can_see_leave_of(employee_id));
revoke insert, update, delete, truncate on public.attendance_logs from authenticated;

create policy ot_requests_select on public.ot_requests for select to authenticated
  using (tenant_id = public.auth_tenant_id() and public.can_see_leave_of(employee_id));
revoke insert, update, delete, truncate on public.ot_requests from authenticated;

-- ── Storage (data-model.md §6): selfies ─────────────────────────────────────────────────
-- selfies: {tenant_id}/{employee_id}/{date}/{file} · the employee uploads their own; owner
-- and HR read; deleted after 90 days by the selfie-purge Edge Function (weekly).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('selfies', 'selfies', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy selfies_select on storage.objects for select to authenticated
  using (
    bucket_id = 'selfies'
    and (storage.foldername(name))[1] = public.auth_tenant_id()::text
    and public.auth_role() in ('owner', 'hr_admin')
  );
create policy selfies_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'selfies'
    and (storage.foldername(name))[1] = public.auth_tenant_id()::text
    and (storage.foldername(name))[2] = public.auth_employee_id()::text
  );

-- For the selfie-purge Edge Function (service role): selfies older than the retention, and
-- clearing the paths once the files are gone.
create or replace function public.selfies_to_purge(p_days integer default 90)
returns table (log_id uuid, selfie_path text)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, a.selfie_path from public.attendance_logs a
  where a.selfie_path is not null and a.clock_in_at < now() - make_interval(days => p_days)
  limit 1000;
$$;
revoke execute on function public.selfies_to_purge(integer) from public, anon, authenticated;
grant execute on function public.selfies_to_purge(integer) to service_role;

create or replace function public.selfies_purged(p_log_ids uuid[])
returns void
language sql
security definer
set search_path = ''
as $$
  update public.attendance_logs set selfie_path = null where id = any (p_log_ids);
$$;
revoke execute on function public.selfies_purged(uuid[]) from public, anon, authenticated;
grant execute on function public.selfies_purged(uuid[]) to service_role;

create or replace function public.queue_selfie_purge()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  select replace(decrypted_secret, '/send-notification-email', '/selfie-purge') into v_url
  from vault.decrypted_secrets where name = 'notify_function_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'notify_webhook_secret';
  if v_url is null or v_secret is null then
    return;
  end if;
  perform net.http_post(url := v_url, body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', v_secret));
end;
$$;
revoke execute on function public.queue_selfie_purge() from public, anon, authenticated;
-- Sundays 03:00 MYT = Saturday 19:00 UTC.
select cron.schedule('selfie_purge', '0 19 * * 6', 'select public.queue_selfie_purge()');
