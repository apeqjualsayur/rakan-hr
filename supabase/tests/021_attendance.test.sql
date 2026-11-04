-- Step 10 (ATT-01 → ATT-05): every row of the OT rate table (payroll-rules.md §5), the
-- wage threshold read from employment_act_parameters, day types, geofence inside / outside,
-- clock in / out, roster checks (credential, leave, 45 h week; soft vs hard), publishing,
-- OT approval → payroll input, and the monthly OT and weekly hours alerts.
begin;
create extension if not exists pgtap with schema extensions;

select plan(39);

-- Tenant K (KL, Sunday rest day): HR, manager Mira, staff Aina (RM2,600 a month, 8 h a day:
-- ORP RM100, HRP RM12.50), Ben (RM5,000, above the threshold), Chan (RM15 an hour).
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000c1002', 'hr-k@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000c1003', 'mira-k@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000c1004', 'aina-k@example.test', 'authenticated', 'authenticated');
insert into public.tenants (id, legal_name, state_code, rest_day, half_days)
  values ('00000000-0000-0000-0000-0000000000c1', 'Tenant K', 'MY-14', 0, '{6}');
insert into public.branches (id, tenant_id, name, state_code, geo_lat, geo_lng, geo_radius_m) values
  ('00000000-0000-0000-0000-0000000c1b01', '00000000-0000-0000-0000-0000000000c1', 'Centre', 'MY-14', 3.139000, 101.686900, 100),
  ('00000000-0000-0000-0000-0000000c1b02', '00000000-0000-0000-0000-0000000000c1', 'No fence', 'MY-14', null, null, null);
insert into public.job_roles (id, tenant_id, name, is_clinical) values
  ('00000000-0000-0000-0000-0000000c1701', '00000000-0000-0000-0000-0000000000c1', 'Therapist', true);
insert into public.role_credential_requirements (job_role_id, credential_type_id, requirement, blocks_roster)
  select '00000000-0000-0000-0000-0000000c1701', t.id, 'mandatory', true from public.credential_types t
  where t.tenant_id = '00000000-0000-0000-0000-0000000000c1' and t.code = 'BLS';
insert into public.employees (id, tenant_id, full_name, branch_id) values
  ('00000000-0000-0000-0000-0000000c1e03', '00000000-0000-0000-0000-0000000000c1', 'Mira', '00000000-0000-0000-0000-0000000c1b01');
insert into public.employees (id, tenant_id, full_name, branch_id, manager_id, job_role_id) values
  ('00000000-0000-0000-0000-0000000c1e04', '00000000-0000-0000-0000-0000000000c1', 'Aina', '00000000-0000-0000-0000-0000000c1b01',
   '00000000-0000-0000-0000-0000000c1e03', '00000000-0000-0000-0000-0000000c1701'),
  ('00000000-0000-0000-0000-0000000c1e05', '00000000-0000-0000-0000-0000000000c1', 'Ben', '00000000-0000-0000-0000-0000000c1b01', null, null),
  ('00000000-0000-0000-0000-0000000c1e06', '00000000-0000-0000-0000-0000000000c1', 'Chan', '00000000-0000-0000-0000-0000000c1b01', null, null);
insert into public.employment_records (employee_id, employment_type, pay_model, basic_salary, hourly_rate, normal_hours_per_day, start_date) values
  ('00000000-0000-0000-0000-0000000c1e03', 'full_time', 'monthly', 6000, null, 8, '2020-01-01'),
  ('00000000-0000-0000-0000-0000000c1e04', 'full_time', 'monthly', 2600, null, 8, '2025-01-01'),
  ('00000000-0000-0000-0000-0000000c1e05', 'full_time', 'monthly', 5000, null, 8, '2025-01-01');
insert into public.employment_records (employee_id, employment_type, pay_model, hourly_rate, normal_hours_per_day, start_date) values
  ('00000000-0000-0000-0000-0000000c1e06', 'part_time', 'hourly', 15, 8, '2025-01-01');
insert into public.memberships (tenant_id, user_id, role, employee_id, branch_ids) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000c1002', 'hr_admin', null, '{}'),
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000c1003', 'manager', '00000000-0000-0000-0000-0000000c1e03', '{00000000-0000-0000-0000-0000000c1b01}'),
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000c1004', 'staff', '00000000-0000-0000-0000-0000000c1e04', '{}');

-- ── The OT rate table (payroll-rules.md §5) ──
select is((public.calc_ot('00000000-0000-0000-0000-0000000c1e04', '2026-11-10', 'normal', 4) ->> 'amount')::numeric, 75.00,
  'normal day OT: 4 h × 1.5 × HRP 12.50 = 75.00');
select is((public.calc_ot('00000000-0000-0000-0000-0000000c1e04', '2026-11-15', 'rest_day', 3) ->> 'amount')::numeric, 50.00,
  'rest day, up to half the normal hours (3 of 8): 0.5 × ORP = 50.00');
select is((public.calc_ot('00000000-0000-0000-0000-0000000c1e04', '2026-11-15', 'rest_day', 4) ->> 'amount')::numeric, 50.00,
  'rest day, exactly half (4 of 8): still 0.5 × ORP');
select is((public.calc_ot('00000000-0000-0000-0000-0000000c1e04', '2026-11-15', 'rest_day', 6) ->> 'amount')::numeric, 100.00,
  'rest day, more than half up to the normal hours (6): 1 × ORP = 100.00');
select is((public.calc_ot('00000000-0000-0000-0000-0000000c1e04', '2026-11-15', 'rest_day', 8) ->> 'amount')::numeric, 100.00,
  'rest day, the full normal hours (8): 1 × ORP');
select is((public.calc_ot('00000000-0000-0000-0000-0000000c1e04', '2026-11-15', 'rest_day', 10) ->> 'amount')::numeric, 150.00,
  'rest day beyond the normal hours (10): 1 × ORP + 2 h × 2 × HRP = 150.00');
select is((public.calc_ot('00000000-0000-0000-0000-0000000c1e04', '2026-11-09', 'public_holiday', 8) ->> 'amount')::numeric, 200.00,
  'public holiday, the normal hours: 2 × ORP = 200.00 (on top of holiday pay)');
select is((public.calc_ot('00000000-0000-0000-0000-0000000c1e04', '2026-11-09', 'public_holiday', 3) ->> 'amount')::numeric, 200.00,
  'public holiday, part of the normal hours: still 2 × ORP');
select is((public.calc_ot('00000000-0000-0000-0000-0000000c1e04', '2026-11-09', 'public_holiday', 10) ->> 'amount')::numeric, 275.00,
  'public holiday beyond the normal hours (10): 2 × ORP + 2 h × 3 × HRP = 275.00');
select results_eq($$ select (c ->> 'orp')::numeric, (c ->> 'hrp')::numeric, c ->> 'method'
  from public.calc_ot('00000000-0000-0000-0000-0000000c1e04', '2026-11-10', 'normal', 1) c $$,
  $$ values (100.0000::numeric, 12.5000::numeric, 'ea') $$, 'ORP = monthly wage ÷ 26; HRP = ORP ÷ normal hours');
select is((public.calc_ot('00000000-0000-0000-0000-0000000c1e06', '2026-11-10', 'normal', 2) ->> 'amount')::numeric, 45.00,
  'hourly-rated: HRP is the hourly rate (2 h × 1.5 × 15 = 45.00)');

-- ── The Employment Act wage threshold (from the settings table) ──
select results_eq($$ select c ->> 'method', (c ->> 'amount')::numeric
  from public.calc_ot('00000000-0000-0000-0000-0000000c1e05', '2026-11-10', 'normal', 4) c $$,
  $$ values ('contract', 0::numeric) $$, 'above the RM4,000 threshold the Act''s OT rates do not apply (contract decides)');
update public.employment_records set ot_rule = 'ea_rates' where employee_id = '00000000-0000-0000-0000-0000000c1e05';
select is((public.calc_ot('00000000-0000-0000-0000-0000000c1e05', '2026-11-10', 'normal', 4) ->> 'amount')::numeric, 144.23,
  'a contract can give Act rates anyway: 4 × 1.5 × (5000 ÷ 26 ÷ 8) = 144.23');
update public.employment_records set ot_rule = 'auto' where employee_id = '00000000-0000-0000-0000-0000000c1e05';
insert into public.employment_act_parameters (effective_from, ot_wage_threshold, ot_monthly_limit_hours, normal_weekly_hours, orp_divisor, source)
  values ('2026-06-01', 6000, 104, 45, 26, 'test: a raised threshold');
select is(public.calc_ot('00000000-0000-0000-0000-0000000c1e05', '2026-11-10', 'normal', 4) ->> 'method', 'ea',
  'the threshold is read from employment_act_parameters by date, not hard-coded');
select is(public.calc_ot('00000000-0000-0000-0000-0000000c1e05', '2026-05-10', 'normal', 4) ->> 'method', 'contract',
  'work before the new threshold''s date uses the old one');
delete from public.employment_act_parameters where effective_from = '2026-06-01';

-- ── Day types ──
select results_eq($$ values (public.ot_day_type('00000000-0000-0000-0000-0000000c1e04', '2026-11-08'),
  public.ot_day_type('00000000-0000-0000-0000-0000000c1e04', '2026-11-09'),
  public.ot_day_type('00000000-0000-0000-0000-0000000c1e04', '2026-11-15'),
  public.ot_day_type('00000000-0000-0000-0000-0000000c1e04', '2026-11-10')) $$,
  $$ values ('public_holiday', 'public_holiday', 'rest_day', 'normal') $$,
  'Deepavali and its replacement day are public holidays, Sunday a rest day, Tuesday a normal day');

-- ── ATT-01 geofence ──
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000c1004","role":"authenticated","aal":"aal1"}', true);
select results_eq($$ select inside from public.geofence_check('00000000-0000-0000-0000-0000000c1b01', 3.139400, 101.686900) $$,
  $$ values (true) $$, 'about 44 m from the centre (fence 100 m): inside');
select results_eq($$ select inside, distance_m > 600 from public.geofence_check('00000000-0000-0000-0000-0000000c1b01', 3.145000, 101.686900) $$,
  $$ values (false, true) $$, 'about 670 m away: outside');
select results_eq($$ select inside from public.geofence_check('00000000-0000-0000-0000-0000000c1b02', 3.145000, 101.686900) $$,
  $$ values (null::boolean) $$, 'a branch with no fence asks nothing');
select throws_ok($$ select public.clock_in(3.145000, 101.686900, 20, null) $$, '22023', null,
  'clocking in outside the fence needs a reason');
select lives_ok($$ select public.clock_in(3.145000, 101.686900, 20, 'Home visit') $$,
  'outside with a reason is allowed');
select throws_ok($$ select public.clock_in(3.139400, 101.686900, 10) $$, '23505', null, 'one clock-in at a time');
select lives_ok($$ select public.clock_out(3.139400, 101.686900, 10) $$, 'clocking out at the centre');
select results_eq($$ select within_geofence, outside_reason, out_within_geofence from public.attendance_logs $$,
  $$ values (false, 'Home visit', true) $$, 'the log keeps where and why');

-- ── ATT-02 / ATT-03 roster ──
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000c1002","role":"authenticated","aal":"aal2"}', true);
select lives_ok($$ insert into public.roster_shifts (branch_id, employee_id, shift_date, start_time, end_time, break_minutes, room_or_service)
  values ('00000000-0000-0000-0000-0000000c1b01', '00000000-0000-0000-0000-0000000c1e04', '2026-11-16', '09:00', '18:00', 60, 'Room 2') $$,
  'soft enforcement: a shift can be saved with a credential problem');
select results_eq($$ select code, severity from public.check_shift('00000000-0000-0000-0000-0000000c1e04', '2026-11-17', '09:00', '18:00', 60) $$,
  $$ values ('CREDENTIAL', 'warning') $$, 'the missing BLS shows as a warning');
select throws_ok($$ insert into public.roster_shifts (branch_id, employee_id, shift_date, start_time, end_time)
  values ('00000000-0000-0000-0000-0000000c1b01', '00000000-0000-0000-0000-0000000c1e04', '2026-11-16', '17:00', '20:00') $$,
  '23514', null, 'shifts of one person cannot overlap');
reset role;
update public.tenants set credential_enforcement = 'hard' where id = '00000000-0000-0000-0000-0000000000c1';
set local role authenticated;
select throws_ok($$ insert into public.roster_shifts (branch_id, employee_id, shift_date, start_time, end_time)
  values ('00000000-0000-0000-0000-0000000c1b01', '00000000-0000-0000-0000-0000000c1e04', '2026-11-17', '09:00', '17:00') $$,
  '23514', null, 'hard enforcement blocks rostering when a blocks-roster credential is not valid');
reset role;
update public.tenants set credential_enforcement = 'soft' where id = '00000000-0000-0000-0000-0000000000c1';
insert into public.roster_shifts (branch_id, employee_id, shift_date, start_time, end_time, break_minutes)
  select '00000000-0000-0000-0000-0000000c1b01', '00000000-0000-0000-0000-0000000c1e05', d::date, '08:00', '17:00', 60
  from generate_series('2026-11-16'::date, '2026-11-20'::date, interval '1 day') d;
insert into public.leave_requests (employee_id, leave_type_id, start_date, end_date, days, status)
  select '00000000-0000-0000-0000-0000000c1e05', t.id, '2026-11-21', '2026-11-21', 0.5, 'approved'
  from public.leave_types t where t.tenant_id = '00000000-0000-0000-0000-0000000000c1' and t.code = 'ANNUAL';
set local role authenticated;
select results_eq($$ select code from public.check_shift('00000000-0000-0000-0000-0000000c1e05', '2026-11-21', '08:00', '17:00', 60) order by 1 $$,
  $$ values ('LEAVE'), ('WEEK_HOURS') $$, 'a 6th 8-hour shift: leave that day and over 45 hours in the week');
select throws_ok($$ update public.roster_shifts set published_at = now() $$, '42501', null,
  'publishing only goes through publish_roster()');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000c1004","role":"authenticated","aal":"aal1"}', true);
select is((select count(*)::int from public.roster_shifts), 0, 'staff do not see unpublished shifts');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000c1003","role":"authenticated","aal":"aal1"}', true);
select is(public.publish_roster('00000000-0000-0000-0000-0000000c1b01', '2026-11-16'), 2, 'the manager publishes the week (2 people)');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000c1004","role":"authenticated","aal":"aal1"}', true);
select is((select count(*)::int from public.roster_shifts), 1, 'now staff see their own shift');
select is((select count(*)::int from public.notifications where template = 'roster_published'), 1, 'and are told');

-- ── ATT-04 OT request → approval → payroll input ──
select lives_ok($$ select set_config('test.ot', public.request_ot('2026-11-10', 4, 'Late assessment')::text, true) $$,
  'staff ask for 4 h OT on a normal day');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000c1003","role":"authenticated","aal":"aal1"}', true);
select lives_ok($$ select public.act_on_approval((select approval_id from public.ot_requests where id = current_setting('test.ot')::uuid), 'approved', null) $$,
  'the manager approves');
reset role;
select results_eq($$ select o.calculated_amount, p.pay_item_code, p.quantity, p.amount
  from public.ot_requests o join public.payroll_inputs p on p.source_id = o.id where o.id = current_setting('test.ot')::uuid $$,
  $$ values (75.00::numeric(12,2), 'OT_NORMAL', 4.00::numeric(8,2), 75.00::numeric(12,2)) $$,
  'approved OT is calculated and becomes a payroll input');

-- ── ATT-05 alerts ──
insert into public.ot_requests (employee_id, work_date, day_type, hours, status)
  select '00000000-0000-0000-0000-0000000c1e04', d::date, 'normal', 24, 'approved'
  from generate_series('2026-11-02'::date, '2026-11-06'::date, interval '1 day') d;
select public.ot_after_approval(current_setting('test.ot')::uuid);
select is((select count(*)::int from public.compliance_alerts where code = 'OT_MONTHLY_LIMIT' and employee_id = '00000000-0000-0000-0000-0000000c1e04'), 1,
  'more than 104 OT hours in a month raises an alert');
insert into public.attendance_logs (employee_id, branch_id, work_date, clock_in_at, clock_out_at, source)
  select '00000000-0000-0000-0000-0000000c1e05', '00000000-0000-0000-0000-0000000c1b01', d::date,
         (d::date + time '08:00') at time zone 'Asia/Kuala_Lumpur', (d::date + time '17:00') at time zone 'Asia/Kuala_Lumpur', 'manual'
  from generate_series('2026-11-16'::date, '2026-11-21'::date, interval '1 day') d;
select is(public.attendance_hours_scan('2026-11-23'), 1, 'over 45 hours clocked in a week raises an alert');

select * from finish();
rollback;
