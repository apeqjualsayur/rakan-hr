-- Step 9 (LVE-01 → LVE-06): leave types, company leave policies above the Employment Act
-- floor, balances by year (entitlement by years of service, pro-rated for joiners and
-- leavers, carry-forward with expiry), public holidays per state with replacement days,
-- leave requests with manager approval, unpaid leave → payroll inputs, the yearly rollover
-- and carry-forward expiry jobs, and the private `leave` bucket for medical certificates.
--
-- Days are numeric(5,1): half days exist. Statutory minimums live in a global, dated
-- reference table (payroll-rules.md §6); items marked ⚠ VERIFY there are flagged below.

-- ── Work pattern (company) ──────────────────────────────────────────────────────────────
-- Day numbers as Postgres extract(dow): 0 = Sunday … 6 = Saturday. The rest day decides
-- replacement holidays; off days are non-working days that are not the rest day (5-day
-- week); half days count 0.5 (5.5-day week). Seeded from company-config.yaml work_pattern.
alter table public.tenants
  add column rest_day smallint not null default 0 check (rest_day between 0 and 6),
  add column off_days smallint[] not null default '{}'
    check (off_days <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]),
  add column half_days smallint[] not null default '{}'
    check (half_days <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]);

-- ── Statutory minimums (global, dated) ──────────────────────────────────────────────────
create table public.statutory_leave_minimums (
  id uuid primary key default gen_random_uuid(),
  leave_code text not null,
  min_service_months integer not null default 0 check (min_service_months >= 0),
  max_service_months integer check (max_service_months > min_service_months),
  days numeric(5, 1) not null check (days >= 0),
  effective_from date not null,
  source text not null,
  created_at timestamptz not null default now(),
  constraint statutory_leave_minimums_key unique (leave_code, min_service_months, effective_from)
);

-- Employment Act 1955 (as amended 2022). Service bands: under 2 years, 2 to under 5, 5+.
-- ⚠ VERIFY (payroll-rules.md §6): hospitalisation aggregate with sick leave, maternity
-- conditions, paternity conditions (married, 12 months' service, 5 confinements).
insert into public.statutory_leave_minimums (leave_code, min_service_months, max_service_months, days, effective_from, source) values
  ('ANNUAL', 0, 24, 8, '2023-01-01', 'Employment Act 1955 s60E'),
  ('ANNUAL', 24, 60, 12, '2023-01-01', 'Employment Act 1955 s60E'),
  ('ANNUAL', 60, null, 16, '2023-01-01', 'Employment Act 1955 s60E'),
  ('SICK', 0, 24, 14, '2023-01-01', 'Employment Act 1955 s60F'),
  ('SICK', 24, 60, 18, '2023-01-01', 'Employment Act 1955 s60F'),
  ('SICK', 60, null, 22, '2023-01-01', 'Employment Act 1955 s60F'),
  ('HOSPITALISATION', 0, null, 60, '2023-01-01', 'Employment Act 1955 s60F (aggregate with sick leave, ⚠ VERIFY)'),
  ('MATERNITY', 0, null, 98, '2023-01-01', 'Employment Act 1955 s37 (⚠ VERIFY conditions)'),
  ('PATERNITY', 12, null, 7, '2023-01-01', 'Employment Act 1955 s60FA (⚠ VERIFY conditions)');

-- ── LVE-01 leave types (per company) ────────────────────────────────────────────────────
-- counts_calendar_days: maternity and paternity are consecutive days, not working days.
-- prorate: entitlement follows the part of the year employed (annual leave, EA s60E).
-- unlimited: no yearly cap (unpaid). gender: only for that gender (maternity, paternity).
create table public.leave_types (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  code text not null check (code ~ '^[A-Z0-9_]{2,40}$'),
  name_en text not null check (btrim(name_en) <> '' and char_length(name_en) <= 80),
  name_ms text not null check (btrim(name_ms) <> '' and char_length(name_ms) <= 80),
  is_paid boolean not null default true,
  is_statutory boolean not null default false,
  requires_attachment boolean not null default false,
  counts_calendar_days boolean not null default false,
  prorate boolean not null default false,
  unlimited boolean not null default false,
  gender public.gender,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  constraint leave_types_tenant_code_key unique (tenant_id, code)
);
create trigger leave_types_set_updated_at before update on public.leave_types
  for each row execute function public.set_updated_at();

-- Statutory types can be renamed or given an attachment rule, never switched off or made
-- unpaid (they are the law).
create or replace function public.leave_types_before_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.is_statutory and (
    new.code <> old.code or not new.is_active or not new.is_paid or new.unlimited
    or new.counts_calendar_days <> old.counts_calendar_days or new.prorate <> old.prorate
    or new.gender is distinct from old.gender or not new.is_statutory
  ) then
    raise exception 'Statutory leave types cannot be switched off or changed' using errcode = '23514',
      hint = 'statutory_type';
  end if;
  return new;
end;
$$;
create trigger leave_types_before_update
  before update on public.leave_types
  for each row execute function public.leave_types_before_update();

create or replace function public.seed_leave_types(p_tenant_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.leave_types (tenant_id, code, name_en, name_ms, is_paid, is_statutory,
    requires_attachment, counts_calendar_days, prorate, unlimited, gender, sort_order, created_by)
  select p_tenant_id, v.code, v.name_en, v.name_ms, v.is_paid, v.is_statutory, v.attach,
    v.calendar, v.prorate, v.unlimited, v.gender::public.gender, v.sort_order, null
  from (values
    ('ANNUAL', 'Annual leave', 'Cuti tahunan', true, true, false, false, true, false, null, 10),
    ('SICK', 'Sick leave', 'Cuti sakit', true, true, true, false, false, false, null, 20),
    ('HOSPITALISATION', 'Hospitalisation leave', 'Cuti hospital', true, true, true, false, false, false, null, 30),
    ('MATERNITY', 'Maternity leave', 'Cuti bersalin', true, true, false, true, false, false, 'female', 40),
    ('PATERNITY', 'Paternity leave', 'Cuti paterniti', true, true, false, true, false, false, 'male', 50),
    ('REPLACEMENT', 'Replacement leave', 'Cuti ganti', true, false, false, false, false, false, null, 60),
    ('UNPAID', 'Unpaid leave', 'Cuti tanpa gaji', false, false, false, false, false, true, null, 90)
  ) as v (code, name_en, name_ms, is_paid, is_statutory, attach, calendar, prorate, unlimited, gender, sort_order)
  on conflict (tenant_id, code) do nothing;
$$;
revoke execute on function public.seed_leave_types(uuid) from public, anon, authenticated;

-- ── LVE-02 company leave policies ───────────────────────────────────────────────────────
-- One row per type and service band. The company may give more than the law, never less:
-- a row below the statutory minimum for any overlapping band is refused. Bands the company
-- has no row for fall back to the statutory minimum.
create table public.leave_policies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  leave_type_id uuid not null references public.leave_types (id) on delete cascade,
  min_service_months integer not null default 0 check (min_service_months >= 0),
  max_service_months integer check (max_service_months > min_service_months),
  days_per_year numeric(5, 1) not null check (days_per_year >= 0 and days_per_year <= 366),
  carry_forward_max numeric(5, 1) not null default 0 check (carry_forward_max >= 0),
  carry_forward_expiry_months integer check (carry_forward_expiry_months between 1 and 12),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  constraint leave_policies_band_key unique (leave_type_id, min_service_months)
);
create trigger leave_policies_set_updated_at before update on public.leave_policies
  for each row execute function public.set_updated_at();

create or replace function public.leave_policies_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type public.leave_types;
  v_floor numeric;
begin
  select * into v_type from public.leave_types where id = new.leave_type_id;
  new.tenant_id := v_type.tenant_id;
  if v_type.unlimited then
    raise exception 'This leave type has no yearly entitlement' using errcode = '22023';
  end if;
  select max(m.days) into v_floor
  from public.statutory_leave_minimums m
  where m.leave_code = v_type.code
    and m.effective_from <= public.malaysia_today()
    and m.min_service_months < coalesce(new.max_service_months, 2147483647)
    and coalesce(m.max_service_months, 2147483647) > new.min_service_months;
  if v_floor is not null and new.days_per_year < v_floor then
    raise exception 'Below the Employment Act minimum of % days', v_floor using errcode = '23514',
      hint = 'below_statutory_minimum', detail = v_floor::text;
  end if;
  if exists (
    select 1 from public.leave_policies p
    where p.leave_type_id = new.leave_type_id and p.id <> new.id
      and p.min_service_months < coalesce(new.max_service_months, 2147483647)
      and coalesce(p.max_service_months, 2147483647) > new.min_service_months
  ) then
    raise exception 'Service bands overlap' using errcode = '23514', hint = 'bands_overlap';
  end if;
  return new;
end;
$$;
create trigger leave_policies_before_write
  before insert or update on public.leave_policies
  for each row execute function public.leave_policies_before_write();

-- New companies start at the floor; the seed script raises it to company-config.yaml.
create or replace function public.seed_leave_policies(p_tenant_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.leave_policies (leave_type_id, min_service_months, max_service_months, days_per_year, created_by)
  select t.id, m.min_service_months, m.max_service_months, m.days, null
  from public.leave_types t
  join public.statutory_leave_minimums m on m.leave_code = t.code
  where t.tenant_id = p_tenant_id
  on conflict (leave_type_id, min_service_months) do nothing;
$$;
revoke execute on function public.seed_leave_policies(uuid) from public, anon, authenticated;

create or replace function public.tenants_seed_leave()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.seed_leave_types(new.id);
  perform public.seed_leave_policies(new.id);
  return null;
end;
$$;
create trigger tenants_seed_leave
  after insert on public.tenants
  for each row execute function public.tenants_seed_leave();

select public.seed_leave_types(id) from public.tenants;
select public.seed_leave_policies(id) from public.tenants;

-- ── LVE-04 public holidays ──────────────────────────────────────────────────────────────
-- Global rows (tenant_id null) are the gazetted lists, per state code (MY-14 …) or 'ALL'.
-- Companies can add their own (tenant_id set). is_provisional: dates not yet confirmed by
-- the official gazette (shown as such; corrected by a later migration).
create table public.public_holidays (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants (id) on delete cascade,
  state_code text not null check (state_code = 'ALL' or state_code ~ '^MY-[0-9]{2}$'),
  holiday_date date not null,
  name_en text not null check (btrim(name_en) <> '' and char_length(name_en) <= 120),
  name_ms text not null check (btrim(name_ms) <> '' and char_length(name_ms) <= 120),
  is_compulsory boolean not null default false,
  is_provisional boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create unique index public_holidays_key
  on public.public_holidays (coalesce(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), state_code, holiday_date, name_en);
create index public_holidays_date_idx on public.public_holidays (holiday_date);

-- ── Leave balances and requests ─────────────────────────────────────────────────────────
create table public.leave_balances (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  leave_type_id uuid not null references public.leave_types (id) on delete cascade,
  year integer not null check (year between 2000 and 2100),
  entitled numeric(5, 1) check (entitled >= 0), -- null = no cap (unpaid)
  carried_forward numeric(5, 1) not null default 0 check (carried_forward >= 0),
  carry_expires_on date,
  carry_forfeited numeric(5, 1) not null default 0 check (carry_forfeited >= 0),
  adjusted numeric(5, 1) not null default 0,
  adjust_note text check (char_length(adjust_note) <= 500),
  taken numeric(5, 1) not null default 0,
  pending numeric(5, 1) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint leave_balances_key unique (employee_id, leave_type_id, year)
);
create index leave_balances_tenant_year_idx on public.leave_balances (tenant_id, year);
create trigger leave_balances_a_set_tenant
  before insert or update of employee_id on public.leave_balances
  for each row execute function public.set_tenant_from_employee();
create trigger leave_balances_set_updated_at before update on public.leave_balances
  for each row execute function public.set_updated_at();

-- 🔒 Never deleted (6-year retention); cancelled instead.
create table public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  leave_type_id uuid not null references public.leave_types (id),
  start_date date not null,
  end_date date not null,
  half_day text check (half_day in ('am', 'pm')),
  days numeric(5, 1) not null check (days > 0),
  reason text check (char_length(reason) <= 1000),
  attachment_path text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  approval_id uuid references public.approvals (id) on delete set null,
  override_negative boolean not null default false,
  decided_at timestamptz,
  decided_by uuid references auth.users (id) on delete set null,
  decision_comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  constraint leave_requests_dates check (end_date >= start_date),
  constraint leave_requests_one_year check (extract(year from start_date) = extract(year from end_date)),
  constraint leave_requests_half_day_single check (half_day is null or start_date = end_date)
);
create index leave_requests_employee_idx on public.leave_requests (employee_id, start_date);
create index leave_requests_tenant_dates_idx on public.leave_requests (tenant_id, start_date, end_date);
create trigger leave_requests_a_set_tenant
  before insert or update of employee_id on public.leave_requests
  for each row execute function public.set_tenant_from_employee();
create trigger leave_requests_set_updated_at before update on public.leave_requests
  for each row execute function public.set_updated_at();
select audit.enable('public.leave_requests');

-- ── Payroll inputs (data-model.md §3.8, first use) ──────────────────────────────────────
-- Unpaid leave becomes an input for the payroll of its month. Runs and pay items arrive
-- with the payroll engine (Steps 14–15): until then the run is null and the item is a code.
-- The amount is worked out by the engine (payroll-rules.md §7 pro-rating, ⚠ VERIFY).
create table public.payroll_inputs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  period_month date not null check (extract(day from period_month) = 1),
  payroll_run_id uuid,
  pay_item_code text not null check (pay_item_code ~ '^[A-Z0-9_]{2,40}$'),
  quantity numeric(8, 2),
  amount numeric(12, 2),
  source text not null check (source in ('manual', 'attendance', 'claims', 'clinic_sessions', 'leave')),
  source_id uuid,
  description text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create index payroll_inputs_period_idx on public.payroll_inputs (tenant_id, period_month);
create index payroll_inputs_source_idx on public.payroll_inputs (source, source_id);
create trigger payroll_inputs_a_set_tenant
  before insert or update of employee_id on public.payroll_inputs
  for each row execute function public.set_tenant_from_employee();

-- Gazetted holidays for Wilayah Persekutuan Kuala Lumpur (MY-14) and nationwide ('ALL').
-- 2026: the Prime Minister's Department list (kabinet.gov.my) as republished; Hari Raya
-- Aidilfitri is provisional because published lists disagree (20–21 vs 21–22 March).
-- 2027: provisional, from published calendars, until the official gazette; Islamic
-- holidays depend on the official sighting announcement. Compulsory = the five EA s60D days.
-- Replacement days are not stored: holiday_calendar() works them out from each company's
-- rest day. Other states are added when a company there signs up.
insert into public.public_holidays (tenant_id, state_code, holiday_date, name_en, name_ms, is_compulsory, is_provisional, created_by) values
  (null, 'MY-14', '2026-01-01', 'New Year''s Day', 'Tahun Baharu', false, false, null),
  (null, 'MY-14', '2026-02-01', 'Thaipusam', 'Hari Thaipusam', false, false, null),
  (null, 'MY-14', '2026-02-01', 'Federal Territory Day', 'Hari Wilayah Persekutuan', true, false, null),
  (null, 'ALL', '2026-02-17', 'Chinese New Year', 'Tahun Baharu Cina', false, false, null),
  (null, 'MY-14', '2026-02-18', 'Chinese New Year (second day)', 'Tahun Baharu Cina (hari kedua)', false, false, null),
  (null, 'MY-14', '2026-03-07', 'Nuzul Al-Quran', 'Nuzul Al-Quran', false, false, null),
  (null, 'ALL', '2026-03-21', 'Hari Raya Aidilfitri', 'Hari Raya Aidilfitri', false, true, null),
  (null, 'ALL', '2026-03-22', 'Hari Raya Aidilfitri (second day)', 'Hari Raya Aidilfitri (hari kedua)', false, true, null),
  (null, 'ALL', '2026-05-01', 'Labour Day', 'Hari Pekerja', true, false, null),
  (null, 'ALL', '2026-05-27', 'Hari Raya Haji', 'Hari Raya Haji', false, false, null),
  (null, 'ALL', '2026-05-31', 'Wesak Day', 'Hari Wesak', false, false, null),
  (null, 'ALL', '2026-06-01', 'Birthday of the Yang di-Pertuan Agong', 'Hari Keputeraan Yang di-Pertuan Agong', true, false, null),
  (null, 'ALL', '2026-06-17', 'Awal Muharram', 'Awal Muharam', false, false, null),
  (null, 'ALL', '2026-08-25', 'Prophet Muhammad''s Birthday', 'Maulidur Rasul', false, false, null),
  (null, 'ALL', '2026-08-31', 'National Day', 'Hari Kebangsaan', true, false, null),
  (null, 'ALL', '2026-09-16', 'Malaysia Day', 'Hari Malaysia', true, false, null),
  (null, 'MY-14', '2026-11-08', 'Deepavali', 'Deepavali', false, false, null),
  (null, 'ALL', '2026-12-25', 'Christmas Day', 'Hari Krismas', false, false, null),
  (null, 'MY-14', '2027-01-01', 'New Year''s Day', 'Tahun Baharu', false, true, null),
  (null, 'MY-14', '2027-01-22', 'Thaipusam', 'Hari Thaipusam', false, true, null),
  (null, 'MY-14', '2027-02-01', 'Federal Territory Day', 'Hari Wilayah Persekutuan', true, true, null),
  (null, 'ALL', '2027-02-06', 'Chinese New Year', 'Tahun Baharu Cina', false, true, null),
  (null, 'MY-14', '2027-02-07', 'Chinese New Year (second day)', 'Tahun Baharu Cina (hari kedua)', false, true, null),
  (null, 'MY-14', '2027-02-24', 'Nuzul Al-Quran', 'Nuzul Al-Quran', false, true, null),
  (null, 'ALL', '2027-03-10', 'Hari Raya Aidilfitri', 'Hari Raya Aidilfitri', false, true, null),
  (null, 'ALL', '2027-03-11', 'Hari Raya Aidilfitri (second day)', 'Hari Raya Aidilfitri (hari kedua)', false, true, null),
  (null, 'ALL', '2027-05-01', 'Labour Day', 'Hari Pekerja', true, true, null),
  (null, 'ALL', '2027-05-17', 'Hari Raya Haji', 'Hari Raya Haji', false, true, null),
  (null, 'ALL', '2027-05-20', 'Wesak Day', 'Hari Wesak', false, true, null),
  (null, 'ALL', '2027-06-06', 'Awal Muharram', 'Awal Muharam', false, true, null),
  (null, 'ALL', '2027-06-07', 'Birthday of the Yang di-Pertuan Agong', 'Hari Keputeraan Yang di-Pertuan Agong', true, true, null),
  (null, 'ALL', '2027-08-15', 'Prophet Muhammad''s Birthday', 'Maulidur Rasul', false, true, null),
  (null, 'ALL', '2027-08-31', 'National Day', 'Hari Kebangsaan', true, true, null),
  (null, 'ALL', '2027-09-16', 'Malaysia Day', 'Hari Malaysia', true, true, null),
  (null, 'MY-14', '2027-10-28', 'Deepavali', 'Deepavali', false, true, null),
  (null, 'ALL', '2027-12-25', 'Christmas Day', 'Hari Krismas', false, true, null);

-- The state whose holidays apply to someone: their branch's state, else the company's.
create or replace function public.employee_state_code(p_employee_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(b.state_code, t.state_code)
  from public.employees e
  join public.tenants t on t.id = e.tenant_id
  left join public.branches b on b.id = e.branch_id
  where e.id = p_employee_id;
$$;
revoke execute on function public.employee_state_code(uuid) from public, anon, authenticated;

-- LVE-04: holidays between two dates for a company and state, with replacement days. Each
-- holiday that falls on the rest day gives the next working day off (not the rest day, an
-- off day or another holiday); two holidays on the same rest day give two days (e.g.
-- Thaipusam and Federal Territory Day on Sunday 1 Feb 2026 → 2 and 3 Feb).
create or replace function public.holiday_calendar(
  p_tenant_id uuid,
  p_state_code text,
  p_from date,
  p_to date
)
returns table (holiday_date date, name_en text, name_ms text, is_replacement boolean,
  replaces date, is_provisional boolean, is_company boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tenant public.tenants;
  v_h record;
  v_day date;
  v_taken date[] := '{}';
begin
  select * into v_tenant from public.tenants where id = p_tenant_id;
  -- Look a little before the range: a holiday on the last rest day can be replaced inside it.
  create temporary table if not exists pg_temp.rakan_holidays (
    d date, en text, ms text, repl boolean, replaces date, prov boolean, company boolean
  ) on commit drop;
  delete from pg_temp.rakan_holidays;
  insert into pg_temp.rakan_holidays
    select h.holiday_date, h.name_en, h.name_ms, false, null, h.is_provisional, h.tenant_id is not null
    from public.public_holidays h
    where h.holiday_date between p_from - 14 and p_to + 14
      and (h.state_code = 'ALL' or h.state_code = p_state_code)
      and (h.tenant_id is null or h.tenant_id = p_tenant_id);
  select array_agg(distinct d) into v_taken from pg_temp.rakan_holidays;
  v_taken := coalesce(v_taken, '{}');
  for v_h in
    select * from pg_temp.rakan_holidays
    where extract(dow from d)::smallint = v_tenant.rest_day and not repl
    order by d, en
  loop
    v_day := v_h.d + 1;
    while extract(dow from v_day)::smallint = v_tenant.rest_day
       or extract(dow from v_day)::smallint = any (v_tenant.off_days)
       or v_day = any (v_taken) loop
      v_day := v_day + 1;
    end loop;
    v_taken := v_taken || v_day;
    insert into pg_temp.rakan_holidays values
      (v_day, v_h.en || ' (replacement)', v_h.ms || ' (ganti)', true, v_h.d, v_h.prov, v_h.company);
  end loop;
  return query
    select r.d, r.en, r.ms, r.repl, r.replaces, r.prov, r.company
    from pg_temp.rakan_holidays r
    where r.d between p_from and p_to
    order by r.d, r.repl, r.en;
end;
$$;
revoke execute on function public.holiday_calendar(uuid, text, date, date) from public, anon;
grant execute on function public.holiday_calendar(uuid, text, date, date) to authenticated;

-- The signed-in user's company and state, for the calendar screens.
create or replace function public.my_holidays(p_from date, p_to date)
returns table (holiday_date date, name_en text, name_ms text, is_replacement boolean,
  replaces date, is_provisional boolean, is_company boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.holiday_calendar(
    public.auth_tenant_id(),
    coalesce(public.employee_state_code(public.auth_employee_id()),
             (select t.state_code from public.tenants t where t.id = public.auth_tenant_id())),
    p_from, p_to)
  where public.auth_tenant_id() is not null;
$$;
revoke execute on function public.my_holidays(date, date) from public, anon;
grant execute on function public.my_holidays(date, date) to authenticated;

-- Working days a leave takes for someone: rest days, off days and holidays are skipped,
-- half days count 0.5; maternity / paternity count every calendar day. A half-day request
-- (am / pm) is 0.5 on a working day.
create or replace function public.leave_days(
  p_employee_id uuid,
  p_leave_type_id uuid,
  p_start date,
  p_end date,
  p_half_day text default null
)
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_type public.leave_types;
  v_tenant public.tenants;
  v_holidays date[];
  v_day date;
  v_dow smallint;
  v_total numeric := 0;
begin
  if p_end < p_start then
    return 0;
  end if;
  select * into v_type from public.leave_types where id = p_leave_type_id;
  if v_type.counts_calendar_days then
    return case when p_half_day is not null then 0.5 else (p_end - p_start + 1) end;
  end if;
  select t.* into v_tenant from public.tenants t join public.employees e on e.tenant_id = t.id
  where e.id = p_employee_id;
  select array_agg(c.holiday_date) into v_holidays
  from public.holiday_calendar(v_tenant.id, public.employee_state_code(p_employee_id), p_start, p_end) c;
  v_day := p_start;
  while v_day <= p_end loop
    v_dow := extract(dow from v_day)::smallint;
    if v_dow <> v_tenant.rest_day and not (v_dow = any (v_tenant.off_days))
       and not (v_day = any (coalesce(v_holidays, '{}'))) then
      v_total := v_total + case
        when p_half_day is not null or v_dow = any (v_tenant.half_days) then 0.5 else 1 end;
    end if;
    v_day := v_day + 1;
  end loop;
  return v_total;
end;
$$;
revoke execute on function public.leave_days(uuid, uuid, date, date, text) from public, anon, authenticated;

-- ── LVE-02 / LVE-03 entitlement ─────────────────────────────────────────────────────────
-- Completed months of service on a date (1 year 364 days = 23 months).
create or replace function public.service_months(p_start date, p_on date)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case when p_on < p_start then -1 else
    (extract(year from age(p_on, p_start)) * 12 + extract(month from age(p_on, p_start)))::int end;
$$;

-- Days a year for a service band: the company's policy, never below the law.
create or replace function public.leave_band_days(p_leave_type_id uuid, p_service_months integer)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(
    (select p.days_per_year from public.leave_policies p
     where p.leave_type_id = p_leave_type_id
       and p.min_service_months <= p_service_months
       and coalesce(p.max_service_months, 2147483647) > p_service_months),
    (select max(m.days) from public.statutory_leave_minimums m
     join public.leave_types t on t.code = m.leave_code and t.is_statutory
     where t.id = p_leave_type_id
       and m.effective_from <= public.malaysia_today()
       and m.min_service_months <= p_service_months
       and coalesce(m.max_service_months, 2147483647) > p_service_months),
    0
  );
$$;
revoke execute on function public.leave_band_days(uuid, integer) from public, anon, authenticated;

-- First day of continuous employment, and the last day if it has an end.
create or replace function public.employee_service(p_employee_id uuid)
returns table (service_start date, service_end date)
language sql
stable
security definer
set search_path = ''
as $$
  select min(r.start_date),
         (select c.end_date from public.employment_records c
          where c.employee_id = p_employee_id and c.is_current)
  from public.employment_records r
  where r.employee_id = p_employee_id;
$$;
revoke execute on function public.employee_service(uuid) from public, anon, authenticated;

-- A year's entitlement. Pro-rated types (annual) add up the days employed in the year at
-- the band each day falls in (so passing 2 years in July gives a blend); a fraction of half
-- a day or more rounds up, less rounds down (EA s60E(1A), ⚠ VERIFY). Other types take the
-- band reached by the end of the year (or of employment), in the employee's favour.
-- Unlimited types: null. Gender-specific types: 0 for others.
create or replace function public.leave_entitlement(p_employee_id uuid, p_leave_type_id uuid, p_year integer)
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_type public.leave_types;
  v_gender public.gender;
  v_start date;
  v_end date;
  v_from date;
  v_to date;
  v_year_days integer := (make_date(p_year + 1, 1, 1) - make_date(p_year, 1, 1));
  v_sum numeric;
begin
  select * into v_type from public.leave_types where id = p_leave_type_id;
  if v_type.unlimited then
    return null;
  end if;
  if v_type.code = 'REPLACEMENT' then
    return 0; -- earned by working on holidays (adjustments), not given yearly
  end if;
  select e.gender into v_gender from public.employees e where e.id = p_employee_id;
  if v_type.gender is not null and v_gender is distinct from v_type.gender then
    return 0;
  end if;
  select s.service_start, s.service_end into v_start, v_end from public.employee_service(p_employee_id) s;
  if v_start is null then
    return 0;
  end if;
  v_from := greatest(v_start, make_date(p_year, 1, 1));
  v_to := least(coalesce(v_end, make_date(p_year, 12, 31)), make_date(p_year, 12, 31));
  if v_to < v_from then
    return 0;
  end if;
  if v_type.prorate then
    select sum(public.leave_band_days(p_leave_type_id, public.service_months(v_start, d::date)))
    into v_sum
    from generate_series(v_from, v_to, interval '1 day') d;
    return round(v_sum / v_year_days);
  end if;
  return public.leave_band_days(p_leave_type_id, public.service_months(v_start, v_to));
end;
$$;
revoke execute on function public.leave_entitlement(uuid, uuid, integer) from public, anon, authenticated;

-- What is left: entitlement + carried forward (less forfeited) + adjustments − taken −
-- pending. Null for unlimited types.
create or replace function public.leave_available(p_balance public.leave_balances)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case when p_balance.entitled is null then null else
    p_balance.entitled + p_balance.carried_forward - p_balance.carry_forfeited
    + p_balance.adjusted - p_balance.taken - p_balance.pending end;
$$;

-- Taken and pending, from the requests.
create or replace function public.recount_leave_balance(p_employee_id uuid, p_leave_type_id uuid, p_year integer)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.leave_balances b set
    taken = coalesce((select sum(r.days) from public.leave_requests r
      where r.employee_id = p_employee_id and r.leave_type_id = p_leave_type_id
        and extract(year from r.start_date) = p_year and r.status = 'approved'), 0),
    pending = coalesce((select sum(r.days) from public.leave_requests r
      where r.employee_id = p_employee_id and r.leave_type_id = p_leave_type_id
        and extract(year from r.start_date) = p_year and r.status = 'pending'), 0)
  where b.employee_id = p_employee_id and b.leave_type_id = p_leave_type_id and b.year = p_year;
$$;
revoke execute on function public.recount_leave_balance(uuid, uuid, integer) from public, anon, authenticated;

-- Creates or updates someone's balances for a year (entitlement recalculated; carry,
-- adjustments and history kept).
create or replace function public.refresh_leave_balances(p_employee_id uuid, p_year integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type public.leave_types;
begin
  for v_type in
    select t.* from public.leave_types t
    join public.employees e on e.tenant_id = t.tenant_id
    where e.id = p_employee_id and t.is_active
  loop
    insert into public.leave_balances (employee_id, leave_type_id, year, entitled)
    values (p_employee_id, v_type.id, p_year, public.leave_entitlement(p_employee_id, v_type.id, p_year))
    on conflict (employee_id, leave_type_id, year)
    do update set entitled = excluded.entitled;
    perform public.recount_leave_balance(p_employee_id, v_type.id, p_year);
  end loop;
end;
$$;
revoke execute on function public.refresh_leave_balances(uuid, integer) from public, anon, authenticated;

-- Balances follow the contract: a new or changed contract, someone becoming active (e.g.
-- Convert to employee, HIR-05) or a gender correction recalculates this year's.
create or replace function public.leave_refresh_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_employee uuid := case when tg_table_name = 'employees' then new.id else new.employee_id end;
begin
  if exists (select 1 from public.employees e
             where e.id = v_employee and e.status in ('active', 'on_notice') and e.deleted_at is null) then
    perform public.refresh_leave_balances(v_employee, extract(year from public.malaysia_today())::int);
  end if;
  return null;
end;
$$;
create trigger employment_records_refresh_leave
  after insert or update of start_date, end_date, is_current on public.employment_records
  for each row execute function public.leave_refresh_trigger();
create trigger employees_refresh_leave
  after update of status, gender on public.employees
  for each row execute function public.leave_refresh_trigger();
-- Policy changes recalculate this year's entitlements for the company.
create or replace function public.leave_policies_after_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_employee uuid;
begin
  for v_employee in
    select e.id from public.employees e
    where e.tenant_id = coalesce(new.tenant_id, old.tenant_id)
      and e.status in ('active', 'on_notice') and e.deleted_at is null
  loop
    perform public.refresh_leave_balances(v_employee, extract(year from public.malaysia_today())::int);
  end loop;
  return null;
end;
$$;
create trigger leave_policies_after_change
  after insert or update or delete on public.leave_policies
  for each row execute function public.leave_policies_after_change();

-- ── LVE-05 apply, approve, cancel ───────────────────────────────────────────────────────
-- Who approves someone's leave: their manager's account, else HR (or the owner).
create or replace function public.leave_approval_steps(p_employee_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select jsonb_build_array(jsonb_build_object('user_id', m.user_id))
     from public.employees e
     join public.memberships m on m.employee_id = e.manager_id and m.is_active and m.user_id is not null
     where e.id = p_employee_id
     limit 1),
    (select jsonb_build_array(jsonb_build_object('role', public.hr_reviewer_role(e.tenant_id)))
     from public.employees e where e.id = p_employee_id)
  );
$$;
revoke execute on function public.leave_approval_steps(uuid) from public, anon, authenticated;

-- Staff apply for themselves (→ their manager approves). The owner / HR admin can record
-- leave for anyone (approved straight away), and only they may let a balance go below
-- zero (p_override_negative). Checks: dates in one year, no overlap with other leave, an
-- attachment where the type needs one (medical certificate), gender and service rules,
-- sick + hospitalisation within 60 days (⚠ VERIFY), and the balance.
create or replace function public.apply_leave(
  p_leave_type_id uuid,
  p_start date,
  p_end date,
  p_half_day text default null,
  p_reason text default null,
  p_attachment_path text default null,
  p_employee_id uuid default null,
  p_override_negative boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.app_role := public.auth_role();
  v_admin boolean := public.auth_role() in ('owner', 'hr_admin');
  v_employee_id uuid := coalesce(p_employee_id, public.auth_employee_id());
  v_employee public.employees;
  v_type public.leave_types;
  v_days numeric;
  v_year integer := extract(year from p_start)::int;
  v_balance public.leave_balances;
  v_available numeric;
  v_id uuid;
  v_approval_id uuid;
  v_sick_hosp numeric;
begin
  if v_employee_id is null then
    raise exception 'Your account is not linked to an employee record' using errcode = '42501',
      hint = 'not_linked';
  end if;
  if v_employee_id is distinct from public.auth_employee_id() and not v_admin then
    raise exception 'Only HR can record leave for someone else' using errcode = '42501';
  end if;
  if p_override_negative and not v_admin then
    raise exception 'Only HR can allow a negative balance' using errcode = '42501';
  end if;
  select * into v_employee from public.employees
  where id = v_employee_id and tenant_id = public.auth_tenant_id() and deleted_at is null;
  if not found or v_employee.status not in ('active', 'on_notice') then
    raise exception 'Employee not found' using errcode = 'P0002';
  end if;
  select * into v_type from public.leave_types
  where id = p_leave_type_id and tenant_id = v_employee.tenant_id and is_active;
  if not found then
    raise exception 'Leave type not found' using errcode = 'P0002';
  end if;
  if p_end < p_start or extract(year from p_end)::int <> v_year then
    raise exception 'Leave must start and end in the same year' using errcode = '22023', hint = 'bad_dates';
  end if;
  if p_half_day is not null and (p_start <> p_end or p_half_day not in ('am', 'pm')) then
    raise exception 'A half day is a single day' using errcode = '22023', hint = 'bad_dates';
  end if;
  if v_type.gender is not null and v_employee.gender is distinct from v_type.gender then
    raise exception 'This leave type does not apply' using errcode = '22023', hint = 'not_eligible';
  end if;
  if exists (
    select 1 from public.leave_requests r
    where r.employee_id = v_employee_id and r.status in ('pending', 'approved')
      and r.start_date <= p_end and r.end_date >= p_start
  ) then
    raise exception 'This overlaps leave you already have' using errcode = '22023', hint = 'overlap';
  end if;
  if v_type.requires_attachment and not v_admin then
    if p_attachment_path is null or not exists (
      select 1 from storage.objects o
      where o.bucket_id = 'leave' and o.name = p_attachment_path
        and (storage.foldername(o.name))[1] = v_employee.tenant_id::text
        and (storage.foldername(o.name))[2] = v_employee_id::text
    ) then
      raise exception 'Attach the medical certificate' using errcode = '22023', hint = 'attachment_required';
    end if;
  end if;

  v_days := public.leave_days(v_employee_id, p_leave_type_id, p_start, p_end, p_half_day);
  if v_days <= 0 then
    raise exception 'These dates are not working days' using errcode = '22023', hint = 'no_working_days';
  end if;

  perform public.refresh_leave_balances(v_employee_id, v_year);
  select * into v_balance from public.leave_balances
  where employee_id = v_employee_id and leave_type_id = p_leave_type_id and year = v_year;
  v_available := public.leave_available(v_balance);
  if v_type.code = 'HOSPITALISATION' then
    -- Sick and hospitalisation leave together stay within the hospitalisation days (60).
    select coalesce(sum(b.taken + b.pending), 0) into v_sick_hosp
    from public.leave_balances b join public.leave_types t on t.id = b.leave_type_id
    where b.employee_id = v_employee_id and b.year = v_year and t.code = 'SICK';
    v_available := least(v_available, v_balance.entitled + v_balance.adjusted - v_sick_hosp - v_balance.taken - v_balance.pending);
  end if;
  if v_available is not null and v_available - v_days < 0 and not p_override_negative then
    raise exception 'Not enough leave left (% days)', v_available using errcode = '22023',
      hint = 'insufficient_balance', detail = v_available::text;
  end if;

  insert into public.leave_requests (employee_id, leave_type_id, start_date, end_date, half_day,
    days, reason, attachment_path, status, override_negative, decided_at, decided_by)
  values (v_employee_id, p_leave_type_id, p_start, p_end, p_half_day, v_days,
    nullif(btrim(p_reason), ''), p_attachment_path,
    case when v_admin and v_employee_id is distinct from public.auth_employee_id() then 'approved' else 'pending' end,
    p_override_negative,
    case when v_admin and v_employee_id is distinct from public.auth_employee_id() then now() end,
    case when v_admin and v_employee_id is distinct from public.auth_employee_id() then auth.uid() end)
  returning id into v_id;

  if v_admin and v_employee_id is distinct from public.auth_employee_id() then
    perform public.leave_after_approval(v_id);
  else
    v_approval_id := public.create_approval('leave', v_id, public.leave_approval_steps(v_employee_id));
    update public.leave_requests set approval_id = v_approval_id where id = v_id;
  end if;
  perform public.recount_leave_balance(v_employee_id, p_leave_type_id, v_year);
  return v_id;
end;
$$;
revoke execute on function public.apply_leave(uuid, date, date, text, text, text, uuid, boolean) from public, anon;
grant execute on function public.apply_leave(uuid, date, date, text, text, text, uuid, boolean) to authenticated;

-- Approved unpaid leave → one payroll input per month it touches (days in that month).
create or replace function public.leave_after_approval(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.leave_requests;
  v_type public.leave_types;
  v_month date;
  v_from date;
  v_to date;
  v_days numeric;
begin
  select * into v_request from public.leave_requests where id = p_request_id;
  select * into v_type from public.leave_types where id = v_request.leave_type_id;
  if v_type.is_paid then
    return;
  end if;
  v_month := date_trunc('month', v_request.start_date)::date;
  while v_month <= v_request.end_date loop
    v_from := greatest(v_request.start_date, v_month);
    v_to := least(v_request.end_date, (v_month + interval '1 month' - interval '1 day')::date);
    v_days := case when v_request.start_date = v_request.end_date then v_request.days
      else public.leave_days(v_request.employee_id, v_request.leave_type_id, v_from, v_to) end;
    if v_days > 0 then
      insert into public.payroll_inputs (employee_id, period_month, pay_item_code, quantity, source,
        source_id, description, created_by)
      values (v_request.employee_id, v_month, 'UNPAID_LEAVE', v_days, 'leave', v_request.id,
        'Unpaid leave ' || v_from || ' to ' || v_to, null);
    end if;
    v_month := (v_month + interval '1 month')::date;
  end loop;
end;
$$;
revoke execute on function public.leave_after_approval(uuid) from public, anon, authenticated;

create or replace function public.leave_on_approval_decided()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.leave_requests;
  v_comment text;
begin
  select * into v_request from public.leave_requests
  where id = new.entity_id and approval_id = new.id and status = 'pending'
  for update;
  if not found then
    return null;
  end if;
  select s.comment into v_comment from public.approval_steps s
  where s.approval_id = new.id order by s.step_no desc limit 1;
  update public.leave_requests
  set status = case new.status when 'approved' then 'approved' when 'rejected' then 'rejected' else 'cancelled' end,
      decided_at = now(), decided_by = auth.uid(), decision_comment = v_comment
  where id = v_request.id;
  if new.status = 'approved' then
    perform public.leave_after_approval(v_request.id);
  end if;
  perform public.recount_leave_balance(v_request.employee_id, v_request.leave_type_id,
    extract(year from v_request.start_date)::int);
  return null;
end;
$$;
create trigger approvals_leave_decided
  after update of status on public.approvals
  for each row
  when (new.entity_type = 'leave' and old.status = 'pending' and new.status <> 'pending')
  execute function public.leave_on_approval_decided();

-- Staff cancel their own pending leave; the owner / HR admin can also cancel approved
-- leave (its unpaid-leave payroll inputs go too, unless already in a payroll run).
create or replace function public.cancel_leave(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.leave_requests;
  v_admin boolean := public.auth_role() in ('owner', 'hr_admin');
begin
  select * into v_request from public.leave_requests
  where id = p_request_id and tenant_id = public.auth_tenant_id()
  for update;
  if not found or not (v_request.employee_id = public.auth_employee_id() or v_admin) then
    raise exception 'Leave not found' using errcode = 'P0002';
  end if;
  if v_request.status = 'approved' and not v_admin then
    raise exception 'Ask HR to cancel approved leave' using errcode = '42501', hint = 'ask_hr';
  end if;
  if v_request.status not in ('pending', 'approved') then
    raise exception 'This leave is already closed' using errcode = '22023', hint = 'not_open';
  end if;
  if exists (select 1 from public.payroll_inputs p
             where p.source = 'leave' and p.source_id = v_request.id and p.payroll_run_id is not null) then
    raise exception 'This leave is already in a payroll run' using errcode = '22023', hint = 'in_payroll';
  end if;
  update public.leave_requests set status = 'cancelled', decided_at = now(), decided_by = auth.uid()
  where id = v_request.id;
  update public.approvals set status = 'cancelled', decided_at = now()
  where id = v_request.approval_id and status = 'pending';
  delete from public.payroll_inputs where source = 'leave' and source_id = v_request.id;
  perform public.recount_leave_balance(v_request.employee_id, v_request.leave_type_id,
    extract(year from v_request.start_date)::int);
end;
$$;
revoke execute on function public.cancel_leave(uuid) from public, anon;
grant execute on function public.cancel_leave(uuid) to authenticated;

-- Days a leave would take (for the apply form), for the caller or, for HR, anyone.
create or replace function public.preview_leave_days(
  p_leave_type_id uuid,
  p_start date,
  p_end date,
  p_half_day text default null,
  p_employee_id uuid default null
)
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_employee uuid := coalesce(p_employee_id, public.auth_employee_id());
begin
  if v_employee is null or not exists (
    select 1 from public.employees e
    where e.id = v_employee and e.tenant_id = public.auth_tenant_id()
      and (e.id = public.auth_employee_id() or public.auth_role() in ('owner', 'hr_admin'))
  ) then
    return null;
  end if;
  return public.leave_days(v_employee, p_leave_type_id, p_start, p_end, p_half_day);
end;
$$;
revoke execute on function public.preview_leave_days(uuid, date, date, text, uuid) from public, anon;
grant execute on function public.preview_leave_days(uuid, date, date, text, uuid) to authenticated;

-- HR adjusts a balance (e.g. replacement leave earned, a correction), with a note.
create or replace function public.adjust_leave_balance(
  p_employee_id uuid,
  p_leave_type_id uuid,
  p_year integer,
  p_days numeric,
  p_note text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.auth_role() is null or public.auth_role() not in ('owner', 'hr_admin') then
    raise exception 'Only the owner or HR admin can adjust balances' using errcode = '42501';
  end if;
  if btrim(coalesce(p_note, '')) = '' then
    raise exception 'Give a reason' using errcode = '22023', hint = 'reason_required';
  end if;
  if not exists (select 1 from public.employees e where e.id = p_employee_id and e.tenant_id = public.auth_tenant_id()) then
    raise exception 'Employee not found' using errcode = 'P0002';
  end if;
  perform public.refresh_leave_balances(p_employee_id, p_year);
  update public.leave_balances
  set adjusted = adjusted + p_days,
      adjust_note = left(concat_ws(E'\n', adjust_note,
        to_char(public.malaysia_today(), 'YYYY-MM-DD') || ': ' || case when p_days >= 0 then '+' else '' end
        || p_days || ' — ' || btrim(p_note)), 500)
  where employee_id = p_employee_id and leave_type_id = p_leave_type_id and year = p_year;
  if not found then
    raise exception 'Leave type not found' using errcode = 'P0002';
  end if;
end;
$$;
revoke execute on function public.adjust_leave_balance(uuid, uuid, integer, numeric, text) from public, anon;
grant execute on function public.adjust_leave_balance(uuid, uuid, integer, numeric, text) to authenticated;

-- ── LVE-06 team calendar ────────────────────────────────────────────────────────────────
-- Leave between two dates that the caller may see: everyone (owner, HR, payroll approver,
-- auditor), the people a manager manages, or — for staff — colleagues in their branch,
-- without the type (sick leave is personal).
create or replace function public.team_leave(p_from date, p_to date)
returns table (
  request_id uuid, employee_id uuid, full_name text, branch_id uuid, job_role_id uuid,
  start_date date, end_date date, half_day text, days numeric, status text,
  leave_type_id uuid, type_code text, type_name_en text, type_name_ms text
)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select public.auth_tenant_id() as tenant_id, public.auth_role() as role,
           public.auth_employee_id() as employee_id,
           (select e.branch_id from public.employees e where e.id = public.auth_employee_id()) as branch_id
  )
  select r.id, e.id, e.full_name, e.branch_id, e.job_role_id, r.start_date, r.end_date, r.half_day,
         r.days, r.status,
         case when see_type then t.id end, case when see_type then t.code end,
         case when see_type then t.name_en end, case when see_type then t.name_ms end
  from me
  join public.leave_requests r on r.tenant_id = me.tenant_id
  join public.employees e on e.id = r.employee_id
  join public.leave_types t on t.id = r.leave_type_id
  cross join lateral (
    select (me.role in ('owner', 'hr_admin', 'payroll_approver', 'auditor')
            or e.id = me.employee_id or e.manager_id = me.employee_id
            or public.is_manager_of(e.id)) as see_type
  ) v
  where me.tenant_id is not null
    and r.status in ('pending', 'approved')
    and r.start_date <= p_to and r.end_date >= p_from
    and (v.see_type or (r.status = 'approved' and me.branch_id is not null and e.branch_id = me.branch_id))
  order by r.start_date, e.full_name;
$$;
revoke execute on function public.team_leave(date, date) from public, anon;
grant execute on function public.team_leave(date, date) to authenticated;

-- ── LVE-03 yearly rollover and carry-forward expiry ─────────────────────────────────────
-- 1 Jan: everyone active gets the new year's balances; unused leave of types whose policy
-- allows carry-forward moves over, capped, expiring after the policy's months.
create or replace function public.leave_year_rollover(p_year integer default extract(year from public.malaysia_today())::int)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_employee record;
  v_prev public.leave_balances;
  v_policy public.leave_policies;
  v_start date;
  v_carry numeric;
  v_count integer := 0;
begin
  for v_employee in
    select e.id from public.employees e
    where e.status in ('active', 'on_notice') and e.deleted_at is null
  loop
    perform public.refresh_leave_balances(v_employee.id, p_year);
    select s.service_start into v_start from public.employee_service(v_employee.id) s;
    for v_prev in
      select b.* from public.leave_balances b
      where b.employee_id = v_employee.id and b.year = p_year - 1
    loop
      select p.* into v_policy from public.leave_policies p
      where p.leave_type_id = v_prev.leave_type_id
        and p.min_service_months <= public.service_months(v_start, make_date(p_year - 1, 12, 31))
        and coalesce(p.max_service_months, 2147483647) > public.service_months(v_start, make_date(p_year - 1, 12, 31));
      v_carry := least(greatest(coalesce(public.leave_available(v_prev) + v_prev.pending, 0), 0),
                       coalesce(v_policy.carry_forward_max, 0));
      update public.leave_balances
      set carried_forward = v_carry,
          carry_expires_on = case when v_carry > 0 and v_policy.carry_forward_expiry_months is not null
            then (make_date(p_year, 1, 1) + make_interval(months => v_policy.carry_forward_expiry_months) - interval '1 day')::date end,
          carry_forfeited = 0
      where employee_id = v_employee.id and leave_type_id = v_prev.leave_type_id and year = p_year;
    end loop;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
revoke execute on function public.leave_year_rollover(integer) from public, anon, authenticated;

-- After the expiry date, carried-forward days not used by then are forfeited (days taken
-- up to the expiry date use the carried days first).
create or replace function public.leave_carry_expiry(p_today date default public.malaysia_today())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_balance public.leave_balances;
  v_used numeric;
  v_count integer := 0;
begin
  for v_balance in
    select * from public.leave_balances
    where carry_expires_on < p_today and carried_forward > 0 and carry_forfeited = 0
  loop
    select coalesce(sum(r.days), 0) into v_used from public.leave_requests r
    where r.employee_id = v_balance.employee_id and r.leave_type_id = v_balance.leave_type_id
      and r.status = 'approved' and extract(year from r.start_date) = v_balance.year
      and r.start_date <= v_balance.carry_expires_on;
    update public.leave_balances
    set carry_forfeited = greatest(v_balance.carried_forward - v_used, 0)
    where id = v_balance.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
revoke execute on function public.leave_carry_expiry(date) from public, anon, authenticated;

-- 1 Jan 00:30 MYT = 31 Dec 16:30 UTC; expiry daily at 00:45 MYT.
select cron.schedule('leave_year_rollover', '30 16 31 12 *',
  $$select public.leave_year_rollover(extract(year from public.malaysia_today())::int)$$);
select cron.schedule('leave_carry_expiry', '45 16 * * *', 'select public.leave_carry_expiry()');

-- Balances for this year for everyone already active.
select public.refresh_leave_balances(e.id, extract(year from public.malaysia_today())::int)
from public.employees e where e.status in ('active', 'on_notice') and e.deleted_at is null;

-- ── RLS (data-model.md §5: leave — own read/insert, team read/approve, HR full, auditor read)
alter table public.statutory_leave_minimums enable row level security;
alter table public.leave_types enable row level security;
alter table public.leave_policies enable row level security;
alter table public.public_holidays enable row level security;
alter table public.leave_balances enable row level security;
alter table public.leave_requests enable row level security;
alter table public.payroll_inputs enable row level security;
revoke all on public.statutory_leave_minimums, public.leave_types, public.leave_policies,
  public.public_holidays, public.leave_balances, public.leave_requests, public.payroll_inputs from anon;

create policy statutory_leave_minimums_select on public.statutory_leave_minimums
  for select to authenticated using (true);
revoke insert, update, delete, truncate on public.statutory_leave_minimums from authenticated;

create policy leave_types_select on public.leave_types for select to authenticated
  using (tenant_id = public.auth_tenant_id());
create policy leave_types_insert on public.leave_types for insert to authenticated
  with check (tenant_id = public.auth_tenant_id() and public.auth_role() in ('owner', 'hr_admin') and not is_statutory);
create policy leave_types_update on public.leave_types for update to authenticated
  using (tenant_id = public.auth_tenant_id() and public.auth_role() in ('owner', 'hr_admin'))
  with check (tenant_id = public.auth_tenant_id());
revoke delete on public.leave_types from authenticated;

create policy leave_policies_select on public.leave_policies for select to authenticated
  using (tenant_id = public.auth_tenant_id());
create policy leave_policies_insert on public.leave_policies for insert to authenticated
  with check (public.auth_role() in ('owner', 'hr_admin')
    and exists (select 1 from public.leave_types t where t.id = leave_type_id and t.tenant_id = public.auth_tenant_id()));
create policy leave_policies_update on public.leave_policies for update to authenticated
  using (tenant_id = public.auth_tenant_id() and public.auth_role() in ('owner', 'hr_admin'))
  with check (tenant_id = public.auth_tenant_id());
create policy leave_policies_delete on public.leave_policies for delete to authenticated
  using (tenant_id = public.auth_tenant_id() and public.auth_role() in ('owner', 'hr_admin'));

create policy public_holidays_select on public.public_holidays for select to authenticated
  using (tenant_id is null or tenant_id = public.auth_tenant_id());
create policy public_holidays_insert on public.public_holidays for insert to authenticated
  with check (tenant_id = public.auth_tenant_id() and public.auth_role() in ('owner', 'hr_admin'));
create policy public_holidays_delete on public.public_holidays for delete to authenticated
  using (tenant_id = public.auth_tenant_id() and public.auth_role() in ('owner', 'hr_admin'));
revoke update on public.public_holidays from authenticated;

-- Balances and requests: own, the people one manages, and the admin roles. Changes go
-- through the functions above (adjust, apply, cancel, approve).
create or replace function public.can_see_leave_of(p_employee_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.employees e
    where e.id = p_employee_id and e.tenant_id = public.auth_tenant_id()
      and (
        public.auth_role() in ('owner', 'hr_admin', 'payroll_approver', 'auditor')
        or e.id = public.auth_employee_id()
        or e.manager_id = public.auth_employee_id()
        or public.is_manager_of(e.id)
      )
  );
$$;
revoke execute on function public.can_see_leave_of(uuid) from public, anon;
grant execute on function public.can_see_leave_of(uuid) to authenticated;

create policy leave_balances_select on public.leave_balances for select to authenticated
  using (tenant_id = public.auth_tenant_id() and public.can_see_leave_of(employee_id));
revoke insert, update, delete, truncate on public.leave_balances from authenticated;
create policy leave_requests_select on public.leave_requests for select to authenticated
  using (tenant_id = public.auth_tenant_id() and public.can_see_leave_of(employee_id));
revoke insert, update, delete, truncate on public.leave_requests from authenticated;

create policy payroll_inputs_select on public.payroll_inputs for select to authenticated
  using (tenant_id = public.auth_tenant_id()
         and public.auth_role() in ('owner', 'hr_admin', 'payroll_approver', 'auditor'));
revoke insert, update, delete, truncate on public.payroll_inputs from authenticated;

-- ── Storage (data-model.md §6): medical certificates ────────────────────────────────────
-- leave: {tenant_id}/{employee_id}/{file} · the employee uploads their own; the employee
-- and owner / HR read (health information: not managers). Never overwritten.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('leave', 'leave', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

create policy leave_files_select on storage.objects for select to authenticated
  using (
    bucket_id = 'leave'
    and (storage.foldername(name))[1] = public.auth_tenant_id()::text
    and (public.auth_role() in ('owner', 'hr_admin')
         or (storage.foldername(name))[2] = public.auth_employee_id()::text)
  );
create policy leave_files_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'leave'
    and (storage.foldername(name))[1] = public.auth_tenant_id()::text
    and (public.auth_role() in ('owner', 'hr_admin')
         or (storage.foldername(name))[2] = public.auth_employee_id()::text)
  );
