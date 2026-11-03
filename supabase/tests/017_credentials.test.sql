-- Step 6 (CRD-01 → CRD-19): credential RLS (own only, managers status only and no files,
-- restricted types), status at boundary dates, renewal supersede, reminders without
-- duplicates, CPD totals.
begin;
create extension if not exists pgtap with schema extensions;

select plan(43);

-- Tenant G: HR admin, auditor, manager of branch 1, staff Aina (branch 1) and Ben (branch 2).
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000f001', 'hr-g@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000f002', 'aina-g@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000f003', 'ben-g@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000f004', 'mgr-g@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000f005', 'aud-g@example.test', 'authenticated', 'authenticated');
insert into public.tenants (id, legal_name) values ('00000000-0000-0000-0000-0000000000a7', 'Tenant G');
insert into public.branches (id, tenant_id, name) values
  ('00000000-0000-0000-0000-0000000a7b01', '00000000-0000-0000-0000-0000000000a7', 'One'),
  ('00000000-0000-0000-0000-0000000a7b02', '00000000-0000-0000-0000-0000000000a7', 'Two');
insert into public.job_roles (id, tenant_id, name, is_clinical) values
  ('00000000-0000-0000-0000-0000000a7a01', '00000000-0000-0000-0000-0000000000a7', 'Therapist', true);
insert into public.employees (id, tenant_id, full_name, branch_id, job_role_id) values
  ('00000000-0000-0000-0000-0000000a7e01', '00000000-0000-0000-0000-0000000000a7', 'Aina', '00000000-0000-0000-0000-0000000a7b01', '00000000-0000-0000-0000-0000000a7a01'),
  ('00000000-0000-0000-0000-0000000a7e02', '00000000-0000-0000-0000-0000000000a7', 'Ben', '00000000-0000-0000-0000-0000000a7b02', '00000000-0000-0000-0000-0000000a7a01');
insert into public.memberships (tenant_id, user_id, role, employee_id, branch_ids) values
  ('00000000-0000-0000-0000-0000000000a7', '00000000-0000-0000-0000-00000000f001', 'hr_admin', null, '{}'),
  ('00000000-0000-0000-0000-0000000000a7', '00000000-0000-0000-0000-00000000f002', 'staff', '00000000-0000-0000-0000-0000000a7e01', '{}'),
  ('00000000-0000-0000-0000-0000000000a7', '00000000-0000-0000-0000-00000000f003', 'staff', '00000000-0000-0000-0000-0000000a7e02', '{}'),
  ('00000000-0000-0000-0000-0000000000a7', '00000000-0000-0000-0000-00000000f004', 'manager', null, '{00000000-0000-0000-0000-0000000a7b01}'),
  ('00000000-0000-0000-0000-0000000000a7', '00000000-0000-0000-0000-00000000f005', 'auditor', null, '{}');

create temp table t_type (code text primary key, id uuid);
insert into t_type select code, id from public.credential_types
where tenant_id = '00000000-0000-0000-0000-0000000000a7';
grant select on t_type to authenticated;

insert into public.role_credential_requirements (job_role_id, credential_type_id, requirement)
select '00000000-0000-0000-0000-0000000a7a01', id, case when code = 'HEPB_VAX' then 'optional' else 'mandatory' end::public.credential_requirement
from t_type where code in ('MAHPC_REG', 'BLS', 'HEPB_VAX');

-- ── Catalogue and status rules ──
select is((select count(*)::int from t_type), 11, 'each company gets the 11 default credential types');
select ok((select restricted from public.credential_types c join t_type t on t.id = c.id where t.code = 'HEPB_VAX'),
  'vaccination records are restricted');

select is(public.credential_validity('2026-01-01', '2026-12-31', '{90,60,30,7}', '2025-12-31'), 'upcoming', 'before the effective date: upcoming');
select is(public.credential_validity('2026-01-01', '2026-12-31', '{90,60,30,7}', '2026-10-01'), 'valid', '91 days before expiry: valid');
select is(public.credential_validity('2026-01-01', '2026-12-31', '{90,60,30,7}', '2026-10-02'), 'expiring_soon', '90 days before expiry: expiring soon');
select is(public.credential_validity('2026-01-01', '2026-12-31', '{90,60,30,7}', '2026-12-31'), 'expiring_soon', 'on the expiry date: still valid, expiring soon');
select is(public.credential_validity('2026-01-01', '2026-12-31', '{90,60,30,7}', '2027-01-01'), 'expired', 'the day after expiry: expired');
select is(public.credential_validity('2026-01-01', null, '{90}', '2040-01-01'), 'valid', 'no expiry: valid');

-- ── Staff (Aina) ──
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000f002","role":"authenticated","aal":"aal1"}', true);

select lives_ok($$
  insert into public.staff_credentials (employee_id, credential_type_id, reference_no, effective_date, expiry_date)
  select '00000000-0000-0000-0000-0000000a7e01', id, 'BLS-1', current_date - 400, current_date + 20
  from t_type where code = 'BLS' $$, 'staff add their own credential as a draft');
-- Fixed ids make the rest of the file readable (the app never chooses ids).
reset role;
update public.staff_credentials set id = '00000000-0000-0000-0000-0000000a7c01' where reference_no = 'BLS-1';
set local role authenticated;
select throws_ok($$
  insert into public.staff_credentials (employee_id, credential_type_id, effective_date, expiry_date)
  select '00000000-0000-0000-0000-0000000a7e02', id, current_date, current_date + 10 from t_type where code = 'BLS' $$,
  '42501', null, 'staff cannot add a credential for someone else');
select throws_ok($$
  insert into public.staff_credentials (employee_id, credential_type_id, effective_date)
  select '00000000-0000-0000-0000-0000000a7e01', id, current_date from t_type where code = 'BLS' $$,
  '22023', null, 'a type with expiry needs an expiry date');
select throws_ok($$
  insert into public.staff_credentials (employee_id, credential_type_id, effective_date, expiry_date)
  select '00000000-0000-0000-0000-0000000a7e01', id, current_date, current_date from t_type where code = 'BLS' $$,
  '23514', null, 'expiry must be after the effective date');
select throws_ok($$ select public.submit_credential('00000000-0000-0000-0000-0000000a7c01') $$,
  '22023', null, 'a credential needs a file before it can be submitted');
select throws_ok($$ update public.staff_credentials set status = 'verified' where id = '00000000-0000-0000-0000-0000000a7c01' $$,
  '42501', null, 'staff cannot set the status themselves');
select throws_ok($$ insert into public.credential_files (tenant_id, staff_credential_id, file_path, mime, size_bytes)
  values ('00000000-0000-0000-0000-0000000000a7', '00000000-0000-0000-0000-0000000a7c01', 'x', 'application/pdf', 1) $$,
  '42501', null, 'files are only written by the upload Edge Function');
select is((select folder from public.credential_upload_target('00000000-0000-0000-0000-0000000a7c01')),
  '00000000-0000-0000-0000-0000000000a7/00000000-0000-0000-0000-0000000a7e01/00000000-0000-0000-0000-0000000a7c01/',
  'the upload gate gives the private folder for the file');

-- The Edge Function stores the file (service role).
reset role;
insert into public.credential_files (tenant_id, staff_credential_id, file_path, mime, size_bytes) values
  ('00000000-0000-0000-0000-0000000000a7', '00000000-0000-0000-0000-0000000a7c01', 'g/a/c01/bls.pdf', 'application/pdf', 1000);
-- Restricted vaccination record for Aina, verified directly by the test.
insert into public.staff_credentials (id, employee_id, credential_type_id, effective_date, status, verified_at)
select '00000000-0000-0000-0000-0000000a7c09', '00000000-0000-0000-0000-0000000a7e01', id, current_date - 100, 'verified', now()
from t_type where code = 'HEPB_VAX';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000f002","role":"authenticated","aal":"aal1"}', true);

select is(public.submit_credential('00000000-0000-0000-0000-0000000a7c01'), 'pending', 'submitting makes it pending');
select is((select a.entity_type || '/' || s.approver_role from public.staff_credentials c
  join public.approvals a on a.id = c.approval_id join public.approval_steps s on s.approval_id = a.id
  where c.id = '00000000-0000-0000-0000-0000000a7c01'), 'credential/hr_admin', 'an HR approval is created');
select is((select display_status from public.v_credential_status v join t_type t on t.id = v.credential_type_id
  where t.code = 'BLS'), 'pending', 'staff see Pending');
select is((select display_status from public.v_credential_status v join t_type t on t.id = v.credential_type_id
  where t.code = 'MAHPC_REG'), 'missing', 'a required credential not uploaded is Missing');
select lives_ok($$
  insert into public.staff_credentials (employee_id, credential_type_id, reference_no, effective_date, expiry_date)
  select '00000000-0000-0000-0000-0000000a7e01', id, 'BLS-2', current_date, current_date + 300
  from t_type where code = 'BLS' $$, 'a second draft is allowed');
reset role;
update public.staff_credentials set id = '00000000-0000-0000-0000-0000000a7c02' where reference_no = 'BLS-2';
insert into public.credential_files (tenant_id, staff_credential_id, file_path, mime, size_bytes) values
  ('00000000-0000-0000-0000-0000000000a7', '00000000-0000-0000-0000-0000000a7c02', 'g/a/c02/bls.pdf', 'application/pdf', 1000);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000f002","role":"authenticated","aal":"aal1"}', true);
select throws_ok($$ select public.submit_credential('00000000-0000-0000-0000-0000000a7c02') $$,
  '23505', null, 'only one pending record per employee and type');

-- ── Manager of branch 1 (Aina's branch, not Ben's) ──
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000f004","role":"authenticated","aal":"aal1"}', true);
select is((select count(*)::int from public.staff_credentials), 0, 'managers cannot read credential records');
select is((select count(*)::int from public.credential_files), 0, 'managers cannot see credential files');
select results_eq($$ select t.code from public.v_credential_status v join t_type t on t.id = v.credential_type_id order by 1 $$,
  array['BLS', 'MAHPC_REG'], 'managers see their team''s status only, without restricted types');
select is((select count(*)::int from public.v_credential_status where employee_id = '00000000-0000-0000-0000-0000000a7e02'), 0,
  'managers do not see staff outside their branches');

-- ── Auditor ──
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000f005","role":"authenticated","aal":"aal1"}', true);
select is((select count(*)::int from public.staff_credentials s join t_type t on t.id = s.credential_type_id where t.code = 'HEPB_VAX'), 0,
  'auditors never see vaccination records');
select is((select count(*)::int from public.credential_files), 0, 'auditors cannot see credential files');

-- ── Ben (another staff member) ──
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000f003","role":"authenticated","aal":"aal1"}', true);
select is((select count(*)::int from public.staff_credentials), 0, 'staff cannot read a colleague''s credentials');
select is((select credential_status from public.v_directory where id = '00000000-0000-0000-0000-0000000a7e01'), 'missing',
  'the directory shows a colleague''s credential status only (a mandatory one is missing)');

-- ── HR admin decides ──
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000f001","role":"authenticated","aal":"aal2"}', true);
select throws_ok($$ select public.decide_credential('00000000-0000-0000-0000-0000000a7c01', 'verified', ' ') $$,
  '22023', null, 'verifying needs the method used');
select lives_ok($$ select public.decide_credential('00000000-0000-0000-0000-0000000a7c01', 'verified', 'Original sighted') $$,
  'HR verifies with a method');
select is((select a.status from public.staff_credentials c join public.approvals a on a.id = c.approval_id
  where c.id = '00000000-0000-0000-0000-0000000a7c01'), 'approved', 'the approval is approved too');
select is((select display_status from public.v_credential_status v join t_type t on t.id = v.credential_type_id
  where t.code = 'HEPB_VAX' and v.employee_id = '00000000-0000-0000-0000-0000000a7e01'), 'valid', 'HR see restricted types');

-- Renewal: Aina's second BLS draft is now submitted, then verified: it supersedes the first.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000f002","role":"authenticated","aal":"aal1"}', true);
select public.submit_credential('00000000-0000-0000-0000-0000000a7c02');
select is((select previous_id from public.staff_credentials where id = '00000000-0000-0000-0000-0000000a7c02'),
  '00000000-0000-0000-0000-0000000a7c01'::uuid, 'a new record of a held type links to it as a renewal');
reset role;

-- ── Daily scan (before the renewal is verified) ──
-- The scan covers every company, so count only this test's reminders (to Aina).
create or replace function pg_temp.aina_reminders(p_template text) returns int language sql as $$
  select count(*)::int from public.notifications
  where user_id = '00000000-0000-0000-0000-00000000f002'
    and template = p_template
    and data ->> 'credential_id' = '00000000-0000-0000-0000-0000000a7c01' $$;

select public.credential_status_scan(current_date);
select is(pg_temp.aina_reminders('credential_expiring'), 0, 'no reminder while a renewal is pending');
update public.staff_credentials set status = 'withdrawn' where id = '00000000-0000-0000-0000-0000000a7c02';
select public.credential_status_scan(current_date);
select is(pg_temp.aina_reminders('credential_expiring'), 1, '20 days before expiry: one reminder');
select public.credential_status_scan(current_date);
select is(pg_temp.aina_reminders('credential_expiring'), 1, 'the same reminder is never sent twice');
select results_eq($$ select offset_days from public.credential_reminders_sent
  where staff_credential_id = '00000000-0000-0000-0000-0000000a7c01' order by 1 $$,
  array[30, 60, 90], 'the crossed offsets are recorded');
select public.credential_status_scan(current_date + 21);
select is(pg_temp.aina_reminders('credential_expired'), 1, 'after expiry: the expired reminder');
select is((select count(*)::int from public.compliance_alerts
  where code = 'CRED_EXPIRED' and entity_id = '00000000-0000-0000-0000-0000000a7c01' and resolved_at is null), 1,
  'an expired credential raises a compliance alert');

-- Verified renewal supersedes the old record and resolves the alert.
update public.staff_credentials set status = 'pending' where id = '00000000-0000-0000-0000-0000000a7c02';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000f001","role":"authenticated","aal":"aal2"}', true);
select public.decide_credential('00000000-0000-0000-0000-0000000a7c02', 'verified', 'Checked certificate');
reset role;
select is((select status::text from public.staff_credentials where id = '00000000-0000-0000-0000-0000000a7c01'), 'superseded',
  'a verified renewal supersedes the old record');

-- ── CPD totals ──
update public.credential_types set cpd_points_required = 30, cpd_cycle_months = 12
where id = (select id from t_type where code = 'APC');
insert into public.staff_credentials (id, employee_id, credential_type_id, effective_date, expiry_date, status, verified_at)
select '00000000-0000-0000-0000-0000000a7c05', '00000000-0000-0000-0000-0000000a7e01', id, '2026-01-01', '2026-12-31', 'verified', now()
from t_type where code = 'APC';
insert into public.cpd_activities (employee_id, credential_type_id, title, activity_date, points, status)
select '00000000-0000-0000-0000-0000000a7e01', id, v.title, v.d::date, v.p, v.s
from t_type, (values ('In cycle', '2026-03-01', 10, 'verified'), ('Pending', '2026-04-01', 5, 'pending'),
                     ('Before cycle', '2025-06-01', 7, 'verified'), ('Rejected', '2026-05-01', 9, 'rejected')) as v (title, d, p, s)
where code = 'APC';
select results_eq($$ select points_verified, points_pending, points_required, target_to_date, on_track
  from public.cpd_progress_all('2026-07-02') where employee_id = '00000000-0000-0000-0000-0000000a7e01' $$,
  $$ values (10::numeric, 5::numeric, 30::numeric, 15.0::numeric, false) $$,
  'CPD counts verified points in the cycle and pro-rates the target');

select * from finish();
rollback;
