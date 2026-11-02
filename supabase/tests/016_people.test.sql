-- Step 5 (EMP-01 → EMP-09): encryption of IC and bank numbers, people RLS, the directory
-- view, reporting-loop guard, contract history, account linking and profile change requests.
begin;
create extension if not exists pgtap with schema extensions;

select plan(36);

-- Tenant E: HR admin, two staff (one a manager-of), one left. Tenant F: one employee.
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000e001', 'hr-e@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000e002', 'aina@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000e003', 'ben@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000e004', 'owner-e@example.test', 'authenticated', 'authenticated');
insert into public.tenants (id, legal_name) values
  ('00000000-0000-0000-0000-0000000000e0', 'Tenant E'),
  ('00000000-0000-0000-0000-0000000000f0', 'Tenant F');
insert into public.memberships (tenant_id, user_id, role) values
  ('00000000-0000-0000-0000-0000000000e0', '00000000-0000-0000-0000-00000000e001', 'hr_admin'),
  ('00000000-0000-0000-0000-0000000000e0', '00000000-0000-0000-0000-00000000e004', 'owner');

insert into public.employees (id, tenant_id, full_name, id_type, id_no, work_email, phone, status) values
  ('00000000-0000-0000-0000-0000000e0e01', '00000000-0000-0000-0000-0000000000e0', 'Aina Test', 'mykad', '010203-14-5678', 'aina@example.test', '012-0000001', 'active'),
  ('00000000-0000-0000-0000-0000000e0e02', '00000000-0000-0000-0000-0000000000e0', 'Ben Test', 'mykad', '880512105431', 'ben@example.test', '012-0000002', 'active'),
  ('00000000-0000-0000-0000-0000000e0e03', '00000000-0000-0000-0000-0000000000e0', 'Cara Left', 'passport', 'a1234567', null, null, 'left'),
  ('00000000-0000-0000-0000-0000000f0e01', '00000000-0000-0000-0000-0000000000f0', 'Other Tenant', 'mykad', '900101145432', null, null, 'active');

-- Staff memberships are linked to employees by matching the invite email (either order).
insert into public.memberships (tenant_id, invited_email, role) values
  ('00000000-0000-0000-0000-0000000000e0', 'aina@example.test', 'staff'),
  ('00000000-0000-0000-0000-0000000000e0', 'ben@example.test', 'staff');

-- ── Encryption at rest ──
select is(
  (select count(*)::int from public.employees where id_no is not null),
  0, 'the plain IC column is always empty'
);
select is(
  (select id_no_last4 from public.employees where id = '00000000-0000-0000-0000-0000000e0e01'),
  '5678', 'the last 4 digits are kept for masked display'
);
select is(
  (select public.pii_decrypt(id_no_encrypted) from public.employees where id = '00000000-0000-0000-0000-0000000e0e01'),
  '010203145678', 'the IC decrypts to the normalised number'
);
select ok(
  (select position('010203145678' in encode(id_no_encrypted, 'escape')) = 0
   from public.employees where id = '00000000-0000-0000-0000-0000000e0e01'),
  'the stored IC is ciphertext'
);
select is(
  (select public.pii_decrypt(id_no_encrypted) from public.employees where id = '00000000-0000-0000-0000-0000000e0e03'),
  'A1234567', 'passport numbers are upper-cased'
);
select is(
  (select count(*)::int from public.audit_log
   where table_name = 'public.employees' and new_data::text like '%010203145678%'),
  0, 'the audit log never holds the plain IC'
);
select throws_ok(
  $$ insert into public.employees (tenant_id, full_name, id_type, id_no)
     values ('00000000-0000-0000-0000-0000000000e0', 'Bad IC', 'mykad', '12345') $$,
  '22023', null, 'a MyKad number must have 12 digits'
);
select throws_ok(
  $$ insert into public.employees (tenant_id, full_name, id_type, id_no)
     values ('00000000-0000-0000-0000-0000000000e0', 'Dup IC', 'mykad', '010203145678') $$,
  '23505', null, 'the same IC cannot be used twice in a company'
);
select lives_ok(
  $$ insert into public.employees (tenant_id, full_name, id_type, id_no)
     values ('00000000-0000-0000-0000-0000000000f0', 'Dup elsewhere', 'mykad', '010203145678') $$,
  'another company may hold the same IC'
);
select results_eq(
  $$ select employee_no from public.employees
     where tenant_id = '00000000-0000-0000-0000-0000000000e0' order by employee_no $$,
  array['E0001', 'E0002', 'E0003'],
  'employees are numbered E0001, E0002, …'
);

-- ── Reporting lines ──
update public.employees set manager_id = '00000000-0000-0000-0000-0000000e0e02'
where id = '00000000-0000-0000-0000-0000000e0e01';
select throws_ok(
  $$ update public.employees set manager_id = '00000000-0000-0000-0000-0000000e0e01'
     where id = '00000000-0000-0000-0000-0000000e0e02' $$,
  '23514', null, 'a reporting loop is refused'
);
select throws_ok(
  $$ update public.employees set manager_id = '00000000-0000-0000-0000-0000000f0e01'
     where id = '00000000-0000-0000-0000-0000000e0e02' $$,
  '23503', null, 'a manager from another company is refused'
);

-- ── Contract history ──
insert into public.employment_records (employee_id, employment_type, pay_model, basic_salary, start_date)
values ('00000000-0000-0000-0000-0000000e0e01', 'contract', 'monthly', 3000, '2026-01-01');
insert into public.employment_records (employee_id, employment_type, pay_model, basic_salary, start_date)
values ('00000000-0000-0000-0000-0000000e0e01', 'full_time', 'monthly', 3500, '2026-07-01');
select results_eq(
  $$ select is_current, end_date, tenant_id from public.employment_records
     where employee_id = '00000000-0000-0000-0000-0000000e0e01' order by start_date $$,
  $$ values (false, '2026-06-30'::date, '00000000-0000-0000-0000-0000000000e0'::uuid),
            (true, null::date, '00000000-0000-0000-0000-0000000000e0'::uuid) $$,
  'a new contract ends the previous one; tenant comes from the employee'
);
select throws_ok(
  $$ insert into public.employment_records (employee_id, employment_type, pay_model, start_date)
     values ('00000000-0000-0000-0000-0000000e0e02', 'full_time', 'monthly', '2026-01-01') $$,
  '23514', null, 'a monthly contract needs a basic salary'
);

-- ── Account linking ──
select is(
  (select employee_id from public.memberships where invited_email = 'aina@example.test'),
  '00000000-0000-0000-0000-0000000e0e01'::uuid,
  'an invite links to the employee with the same work email'
);
update public.memberships set user_id = '00000000-0000-0000-0000-00000000e002'
where invited_email = 'aina@example.test';
update public.memberships set user_id = '00000000-0000-0000-0000-00000000e003'
where invited_email = 'ben@example.test';
select is(
  (select user_id from public.employees where id = '00000000-0000-0000-0000-0000000e0e01'),
  '00000000-0000-0000-0000-00000000e002'::uuid,
  'the employee record learns the user once they sign in'
);

insert into public.bank_accounts (id, employee_id, bank_code, account_no, holder_name, is_primary)
values
  ('00000000-0000-0000-0000-0000000eba01', '00000000-0000-0000-0000-0000000e0e01', 'MBB', '1140-2233-4821', 'AINA TEST', true),
  ('00000000-0000-0000-0000-0000000eba02', '00000000-0000-0000-0000-0000000e0e02', 'CIMB', '8001234567', 'BEN TEST', true);
select is(
  (select account_no_last4 || ':' || public.pii_decrypt(account_no_encrypted) from public.bank_accounts
   where id = '00000000-0000-0000-0000-0000000eba01'),
  '4821:114022334821', 'bank account numbers are encrypted with the last 4 kept'
);

-- ── Staff (Aina) ──
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000e002","role":"authenticated","aal":"aal1"}', true);

select results_eq(
  $$ select id from public.employees $$,
  array['00000000-0000-0000-0000-0000000e0e01'::uuid],
  'staff read only their own employee record'
);
select throws_ok(
  $$ select id_no_encrypted from public.employees $$,
  '42501', null, 'the encrypted IC is not readable through the API'
);
select is(
  (select count(*)::int from public.v_directory), 2,
  'staff see active colleagues in the directory (not leavers, not other companies)'
);
select is(
  (select manager_id from public.v_directory where id = '00000000-0000-0000-0000-0000000e0e01'),
  '00000000-0000-0000-0000-0000000e0e02'::uuid, 'the directory carries reporting lines'
);
select results_eq(
  $$ select account_no_last4 from public.bank_accounts $$,
  array['4821'], 'staff see only their own bank account, masked'
);
select throws_ok(
  $$ select public.reveal_employee_id_no('00000000-0000-0000-0000-0000000e0e01') $$,
  '42501', null, 'staff cannot reveal a full IC, even their own'
);
update public.employees set phone = '999' where id = '00000000-0000-0000-0000-0000000e0e01';
select is(
  (select phone from public.employees where id = '00000000-0000-0000-0000-0000000e0e01'),
  '012-0000001', 'staff cannot edit their record directly'
);
select throws_ok(
  $$ insert into public.profile_change_requests (tenant_id, employee_id, field, new_value)
     values ('00000000-0000-0000-0000-0000000000e0', '00000000-0000-0000-0000-0000000e0e01', 'phone', '{}') $$,
  '42501', null, 'change requests are only made through request_profile_change()'
);

select lives_ok(
  $$ select public.request_profile_change('phone', '{"value":"013-7654321"}') $$,
  'staff request a phone change'
);
select lives_ok(
  $$ select public.request_profile_change('bank_account',
       '{"bank_code":"PBB","account_no":"4455 6677 1234","holder_name":"AINA TEST"}', 'New salary account') $$,
  'staff request a bank change'
);
select throws_ok(
  $$ select public.request_profile_change('bank_account',
       '{"bank_code":"RHB","account_no":"11112222","holder_name":"AINA TEST"}') $$,
  '23505', null, 'only one pending request per detail'
);
select results_eq(
  $$ select a.entity_type, s.approver_role::text from public.profile_change_requests r
     join public.approvals a on a.id = r.approval_id
     join public.approval_steps s on s.approval_id = a.id
     order by a.entity_type $$,
  $$ values ('bank_change', 'hr_admin'), ('profile_change', 'hr_admin') $$,
  'each request becomes an HR approval; bank changes are flagged as bank_change'
);
select is(
  (select count(*)::int from public.profile_change_requests
   where field = 'bank_account' and new_value::text like '%44556677%'),
  0, 'a bank change request never stores the full account number'
);

-- ── HR admin approves ──
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000e001","role":"authenticated","aal":"aal2"}', true);

select is(
  (select count(*)::int from public.employees), 3, 'HR read every employee in their company'
);
select is(
  public.reveal_employee_id_no('00000000-0000-0000-0000-0000000e0e01'),
  '010203145678', 'HR can reveal a full IC'
);
select is(
  (select count(*)::int from public.audit_log where action = 'REVEAL'
   and row_id = '00000000-0000-0000-0000-0000000e0e01'),
  1, 'revealing a full IC is written to the audit log'
);

select public.act_on_approval(r.approval_id, 'approved', null)
from public.profile_change_requests r order by r.field;

select is(
  (select phone from public.employees where id = '00000000-0000-0000-0000-0000000e0e01'),
  '013-7654321', 'an approved phone change is applied'
);
select results_eq(
  $$ select bank_code, status, is_primary, verified_by from public.bank_accounts
     where employee_id = '00000000-0000-0000-0000-0000000e0e01' order by created_at, bank_code $$,
  $$ values ('MBB', 'retired', false, null::uuid),
            ('PBB', 'active', true, '00000000-0000-0000-0000-00000000e001'::uuid) $$,
  'an approved bank change becomes the primary account and retires the old one'
);
select is(
  (select array_agg(status order by field) from public.profile_change_requests),
  array['approved', 'approved'], 'both requests are marked approved'
);

select * from finish();
rollback;
