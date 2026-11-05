-- Step 12 (PAY-10, part 1): banks carry SWIFT / IBG codes, the GENERIC_CSV format exists,
-- company payroll accounts are Owner-only to change, masked for everyone, one default per
-- company, retired but never deleted, and the account number can never change.
begin;
create extension if not exists pgtap with schema extensions;

select plan(22);

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000e1001', 'owner-m@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000e1002', 'hr-m@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000e1003', 'staff-m@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000e1004', 'audit-m@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000e1009', 'owner-other@example.test', 'authenticated', 'authenticated');
insert into public.tenants (id, legal_name) values
  ('00000000-0000-0000-0000-0000000000e1', 'Tenant M'),
  ('00000000-0000-0000-0000-0000000000e9', 'Tenant Other');
insert into public.memberships (tenant_id, user_id, role) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000e1001', 'owner'),
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000e1002', 'hr_admin'),
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000e1003', 'staff'),
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000e1004', 'auditor'),
  ('00000000-0000-0000-0000-0000000000e9', '00000000-0000-0000-0000-0000000e1009', 'owner');

-- Reference data.
select is((select swift_bic || '/' || ibg_code from public.banks where code = 'MBB'), 'MBBEMYKL/MBBEMYKL',
  'Maybank has its SWIFT and IBG code');
select is((select count(*)::int from public.banks where swift_bic is null or ibg_code is null), 0,
  'every bank has a SWIFT and IBG code');
select is((select column_mapping -> 'columns' -> 0 ->> 'field' from public.bank_file_formats where code = 'GENERIC_CSV'),
  'beneficiary_name', 'GENERIC_CSV has its default column mapping');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000e1002","role":"authenticated","aal":"aal2"}', true);
select throws_ok($$ insert into public.company_bank_accounts (tenant_id, bank_code, account_name, account_no)
  values ('00000000-0000-0000-0000-0000000000e1', 'MBB', 'Tenant M Sdn Bhd', '512345678901') $$,
  '42501', null, 'HR cannot add a company account');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000e1001","role":"authenticated","aal":"aal2"}', true);
select throws_ok($$ insert into public.company_bank_accounts (tenant_id, bank_code, account_name, account_no)
  values ('00000000-0000-0000-0000-0000000000e1', 'MBB', 'Tenant M Sdn Bhd', '12-34') $$,
  '22023', null, 'an account number has 6 to 20 digits');
select lives_ok($$ insert into public.company_bank_accounts (id, tenant_id, bank_code, account_name, account_no, corporate_id)
  values ('00000000-0000-0000-0000-0000000eac01', '00000000-0000-0000-0000-0000000000e1', 'MBB', 'Tenant M Sdn Bhd', '5123-4567 8901', 'CORP01') $$,
  'the Owner adds the first account');
select is((select is_default from public.company_bank_accounts where id = '00000000-0000-0000-0000-0000000eac01'), true,
  'the first account becomes the default');
select is((select account_no_last4 from public.company_bank_accounts where id = '00000000-0000-0000-0000-0000000eac01'), '8901',
  'only the last 4 digits are kept in the clear');
select throws_ok($$ select account_no_encrypted from public.company_bank_accounts $$,
  '42501', null, 'nobody in the app can read the encrypted number');
select lives_ok($$ insert into public.company_bank_accounts (id, tenant_id, bank_code, account_name, account_no)
  values ('00000000-0000-0000-0000-0000000eac02', '00000000-0000-0000-0000-0000000000e1', 'CIMB', 'Tenant M Sdn Bhd', '8001234567') $$,
  'any bank can be added');
select is((select is_default from public.company_bank_accounts where id = '00000000-0000-0000-0000-0000000eac02'), false,
  'a second account does not take the default by itself');
select lives_ok($$ update public.company_bank_accounts set is_default = true where id = '00000000-0000-0000-0000-0000000eac02' $$,
  'the Owner switches the default');
select is((select array_agg(bank_code order by bank_code) from public.company_bank_accounts where is_default), '{CIMB}'::text[],
  'there is exactly one default');
select throws_ok($$ update public.company_bank_accounts set account_no = '9999999999' where id = '00000000-0000-0000-0000-0000000eac01' $$,
  '42501', null, 'the account number cannot change');
select lives_ok($$ update public.company_bank_accounts set retired_at = now() where id = '00000000-0000-0000-0000-0000000eac02' $$,
  'the Owner retires the default account');
select is((select is_default::text || '/' || (retired_by is not null)::text from public.company_bank_accounts where id = '00000000-0000-0000-0000-0000000eac02'),
  'false/true', 'retiring gives up the default and records who retired it');
select throws_ok($$ update public.company_bank_accounts set account_name = 'Renamed' where id = '00000000-0000-0000-0000-0000000eac02' $$,
  '42501', null, 'a retired account is frozen');
select throws_ok($$ delete from public.company_bank_accounts where id = '00000000-0000-0000-0000-0000000eac01' $$,
  '42501', null, 'accounts are never deleted');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000e1004","role":"authenticated","aal":"aal1"}', true);
select is((select count(*)::int from public.company_bank_accounts), 2, 'the auditor reads the accounts (masked)');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000e1003","role":"authenticated","aal":"aal1"}', true);
select is((select count(*)::int from public.company_bank_accounts), 0, 'staff see no company accounts');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000e1009","role":"authenticated","aal":"aal2"}', true);
select is((select count(*)::int from public.company_bank_accounts), 0, 'another company sees none');

reset role;
select is((select status::text from public.setup_checklist_items
  where tenant_id = '00000000-0000-0000-0000-0000000000e1' and code = 'PAYROLL_BANK_ACCOUNT'), 'done',
  'setting a default account ticks the checklist item');

select * from finish();
rollback;
