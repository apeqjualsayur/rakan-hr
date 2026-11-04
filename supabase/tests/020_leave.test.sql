-- Step 9 (LVE-01 → LVE-06): the Employment Act floor, entitlement by service (1 year 364
-- days vs 2 years), pro-rating, replacement holidays and working days, apply → manager
-- approval → balance, no negative balance without HR override, medical certificate,
-- unpaid leave → payroll input, who sees what, rollover with carry-forward and expiry.
begin;
create extension if not exists pgtap with schema extensions;

select plan(32);

-- Tenant J (Kuala Lumpur, rest day Sunday, half day Saturday): owner, HR, manager Mira,
-- staff Aina (joined 1 Jan 2025) and Ben (joined 1 Jul 2026), all in branch One.
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000b1001', 'owner-j@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000b1002', 'hr-j@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000b1003', 'mira-j@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000b1004', 'aina-j@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000b1005', 'ben-j@example.test', 'authenticated', 'authenticated');
insert into public.tenants (id, legal_name, state_code, rest_day, half_days)
  values ('00000000-0000-0000-0000-0000000000b1', 'Tenant J', 'MY-14', 0, '{6}');
insert into public.branches (id, tenant_id, name, state_code) values
  ('00000000-0000-0000-0000-0000000b1b01', '00000000-0000-0000-0000-0000000000b1', 'One', 'MY-14');
insert into public.employees (id, tenant_id, full_name, branch_id, gender) values
  ('00000000-0000-0000-0000-0000000b1e03', '00000000-0000-0000-0000-0000000000b1', 'Mira Manager', '00000000-0000-0000-0000-0000000b1b01', 'female');
insert into public.employees (id, tenant_id, full_name, branch_id, manager_id, gender) values
  ('00000000-0000-0000-0000-0000000b1e04', '00000000-0000-0000-0000-0000000000b1', 'Aina', '00000000-0000-0000-0000-0000000b1b01', '00000000-0000-0000-0000-0000000b1e03', 'female'),
  ('00000000-0000-0000-0000-0000000b1e05', '00000000-0000-0000-0000-0000000000b1', 'Ben', '00000000-0000-0000-0000-0000000b1b01', '00000000-0000-0000-0000-0000000b1e03', 'male');
insert into public.employment_records (employee_id, employment_type, pay_model, basic_salary, start_date) values
  ('00000000-0000-0000-0000-0000000b1e03', 'full_time', 'monthly', 6000, '2020-01-01'),
  ('00000000-0000-0000-0000-0000000b1e04', 'full_time', 'monthly', 4000, '2025-01-01'),
  ('00000000-0000-0000-0000-0000000b1e05', 'full_time', 'monthly', 4000, '2026-07-01');
insert into public.memberships (tenant_id, user_id, role, employee_id, branch_ids) values
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000b1001', 'owner', null, '{}'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000b1002', 'hr_admin', null, '{}'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000b1003', 'manager', '00000000-0000-0000-0000-0000000b1e03', '{00000000-0000-0000-0000-0000000b1b01}'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000b1004', 'staff', '00000000-0000-0000-0000-0000000b1e04', '{}'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000b1005', 'staff', '00000000-0000-0000-0000-0000000b1e05', '{}');
select set_config('test.annual', (select id::text from public.leave_types
  where tenant_id = '00000000-0000-0000-0000-0000000000b1' and code = 'ANNUAL'), true);
select set_config('test.sick', (select id::text from public.leave_types
  where tenant_id = '00000000-0000-0000-0000-0000000000b1' and code = 'SICK'), true);
select set_config('test.unpaid', (select id::text from public.leave_types
  where tenant_id = '00000000-0000-0000-0000-0000000000b1' and code = 'UNPAID'), true);

-- ── LVE-02 the Employment Act floor ──
select is((select count(*)::int from public.leave_types where tenant_id = '00000000-0000-0000-0000-0000000000b1' and is_statutory), 5,
  'a new company gets the statutory leave types');
select throws_ok($$ update public.leave_policies set days_per_year = 7
  where leave_type_id = current_setting('test.annual')::uuid and min_service_months = 0 $$,
  '23514', null, 'annual leave below the Employment Act minimum (8 days) is blocked');
select lives_ok($$ update public.leave_policies set days_per_year = 12, carry_forward_max = 5, carry_forward_expiry_months = 3
  where leave_type_id = current_setting('test.annual')::uuid and min_service_months = 0 $$,
  'the company can give more than the minimum');
update public.leave_policies set days_per_year = 14, carry_forward_max = 5, carry_forward_expiry_months = 3
  where leave_type_id = current_setting('test.annual')::uuid and min_service_months = 24;
select throws_ok($$ update public.leave_types set is_active = false where id = current_setting('test.sick')::uuid $$,
  '23514', null, 'statutory leave types cannot be switched off');

-- ── Entitlement by service ──
select is(public.service_months('2025-01-01', '2026-12-31'), 23, '1 year 364 days is 23 completed months');
select is(public.service_months('2025-01-01', '2027-01-01'), 24, '2 years is 24 months');
select is(public.leave_band_days(current_setting('test.sick')::uuid, public.service_months('2025-01-01', '2026-12-31')), 14.0,
  'sick leave at 1 year 364 days: 14 days');
select is(public.leave_band_days(current_setting('test.sick')::uuid, public.service_months('2025-01-01', '2027-01-01')), 18.0,
  'sick leave at 2 years: 18 days');
select is(public.leave_band_days(current_setting('test.annual')::uuid, 23), 12.0, 'annual leave at 23 months: the company''s 12');
select is(public.leave_band_days(current_setting('test.annual')::uuid, 24), 14.0, 'annual leave at 24 months: the company''s 14');

-- ── LVE-03 pro-rating ──
select is(public.leave_entitlement('00000000-0000-0000-0000-0000000b1e05', current_setting('test.annual')::uuid, 2026), 6.0,
  'a joiner on 1 July gets 184/365 of 12 days = 6');
select is(public.leave_entitlement('00000000-0000-0000-0000-0000000b1e04', current_setting('test.annual')::uuid, 2026), 12.0,
  'a full year under 2 years: 12 days');
select is(public.leave_entitlement('00000000-0000-0000-0000-0000000b1e04', current_setting('test.annual')::uuid, 2027), 14.0,
  'from 2 years: 14 days');
update public.employment_records set start_date = '2024-07-01' where employee_id = '00000000-0000-0000-0000-0000000b1e04';
select is(public.leave_entitlement('00000000-0000-0000-0000-0000000b1e04', current_setting('test.annual')::uuid, 2026), 13.0,
  'passing 2 years on 1 July blends the bands: (181 × 12 + 184 × 14) / 365 = 13');
update public.employment_records set start_date = '2025-01-01' where employee_id = '00000000-0000-0000-0000-0000000b1e04';
select is(public.leave_entitlement('00000000-0000-0000-0000-0000000b1e05', current_setting('test.sick')::uuid, 2026), 14.0,
  'sick leave is not pro-rated');

-- ── LVE-04 holidays and working days ──
select results_eq($$ select holiday_date::text, is_replacement from public.holiday_calendar('00000000-0000-0000-0000-0000000000b1', 'MY-14', '2026-02-01', '2026-02-04') order by 1, 2 $$,
  $$ values ('2026-02-01', false), ('2026-02-01', false), ('2026-02-02', true), ('2026-02-03', true) $$,
  'two holidays on Sunday 1 Feb 2026 give two replacement days, Mon 2 and Tue 3 Feb');
select is((select holiday_date from public.holiday_calendar('00000000-0000-0000-0000-0000000000b1', 'MY-14', '2026-05-31', '2026-06-05') where is_replacement), '2026-06-02'::date,
  'Wesak on Sunday 31 May 2026 is replaced on Tuesday 2 June (Monday is already the Agong''s birthday)');
select is(public.leave_days('00000000-0000-0000-0000-0000000b1e04', current_setting('test.annual')::uuid, '2026-02-02', '2026-02-08'), 3.5,
  'Mon 2 – Sun 8 Feb 2026: replacement holidays and Sunday skipped, Saturday counts half');

-- ── LVE-05 apply → manager approves ──
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000b1004","role":"authenticated","aal":"aal1"}', true);
select lives_ok($$ select set_config('test.req', public.apply_leave(current_setting('test.annual')::uuid, '2026-12-14', '2026-12-16')::text, true) $$,
  'staff apply for 3 days');
select throws_ok($$ select public.apply_leave(current_setting('test.annual')::uuid, '2026-12-17', '2026-12-31') $$,
  '22023', null, 'a balance cannot go below zero (12 − 3 pending, 11 more asked)');
select throws_ok($$ select public.apply_leave(current_setting('test.annual')::uuid, '2026-12-17', '2026-12-31', null, null, null, null, true) $$,
  '42501', null, 'staff cannot override the balance check');
select throws_ok($$ select public.apply_leave(current_setting('test.sick')::uuid, '2026-11-30', '2026-11-30') $$,
  '22023', null, 'sick leave needs the medical certificate attached');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000b1005","role":"authenticated","aal":"aal1"}', true);
select throws_ok($$ select public.apply_leave(current_setting('test.annual')::uuid, '2026-06-15', '2026-06-16') $$,
  '22023', null, 'no leave before the employment start date');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000b1004","role":"authenticated","aal":"aal1"}', true);
select is((select count(*)::int from public.leave_balances b where b.employee_id = '00000000-0000-0000-0000-0000000b1e05'), 0,
  'staff cannot see a colleague''s balances');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000b1003","role":"authenticated","aal":"aal1"}', true);
select lives_ok($$ select public.act_on_approval((select approval_id from public.leave_requests where id = current_setting('test.req')::uuid), 'approved', null) $$,
  'her manager approves');
select results_eq($$ select taken, pending, public.leave_available(b) from public.leave_balances b
  where employee_id = '00000000-0000-0000-0000-0000000b1e04' and leave_type_id = current_setting('test.annual')::uuid and year = 2026 $$,
  $$ values (3.0, 0.0, 9.0) $$, 'the balance drops');

-- ── HR override and unpaid leave ──
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000b1002","role":"authenticated","aal":"aal2"}', true);
select lives_ok($$ select public.apply_leave(current_setting('test.annual')::uuid, '2026-12-17', '2026-12-31', null, 'Agreed advance', null,
  '00000000-0000-0000-0000-0000000b1e04', true) $$, 'HR can record leave beyond the balance when they choose to');
select ok((select public.leave_available(b) < 0 from public.leave_balances b
  where employee_id = '00000000-0000-0000-0000-0000000b1e04' and leave_type_id = current_setting('test.annual')::uuid and year = 2026),
  'only then does the balance go negative');
select lives_ok($$ select public.apply_leave(current_setting('test.unpaid')::uuid, '2026-11-30', '2026-12-02', null, null, null,
  '00000000-0000-0000-0000-0000000b1e05') $$, 'HR records unpaid leave across two months');
select results_eq($$ select period_month::text, quantity from public.payroll_inputs
  where employee_id = '00000000-0000-0000-0000-0000000b1e05' order by period_month $$,
  $$ values ('2026-11-01', 1.00::numeric(8,2)), ('2026-12-01', 2.00::numeric(8,2)) $$,
  'unpaid leave becomes a payroll input for each month');

-- ── LVE-03 rollover with carry-forward and expiry ──
reset role;
update public.leave_balances set adjusted = 0 where employee_id = '00000000-0000-0000-0000-0000000b1e05';
select public.leave_year_rollover(2027);
select results_eq($$ select carried_forward, carry_expires_on::text from public.leave_balances
  where employee_id = '00000000-0000-0000-0000-0000000b1e05' and leave_type_id = current_setting('test.annual')::uuid and year = 2027 $$,
  $$ values (5.0, '2027-03-31') $$, 'unused annual leave (6) carries over up to 5 days, expiring after 3 months');
select public.leave_carry_expiry('2027-04-01');
select is((select carry_forfeited from public.leave_balances
  where employee_id = '00000000-0000-0000-0000-0000000b1e05' and leave_type_id = current_setting('test.annual')::uuid and year = 2027), 5.0,
  'carried days not used by the expiry date are forfeited');

select * from finish();
rollback;
