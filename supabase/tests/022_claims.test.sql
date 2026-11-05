-- Step 11 (CLM-01): receipts, per-claim and monthly limits, eligible roles, mileage at the
-- company rate, manager approval → payroll input (taxable / non-taxable), who sees what,
-- receipts fixed once sent, cancelling.
begin;
create extension if not exists pgtap with schema extensions;

select plan(17);

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000d1002', 'hr-l@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000d1003', 'mira-l@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000d1004', 'aina-l@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000d1005', 'ben-l@example.test', 'authenticated', 'authenticated');
insert into public.tenants (id, legal_name) values ('00000000-0000-0000-0000-0000000000d1', 'Tenant L');
insert into public.job_roles (id, tenant_id, name) values
  ('00000000-0000-0000-0000-0000000d1701', '00000000-0000-0000-0000-0000000000d1', 'Therapist'),
  ('00000000-0000-0000-0000-0000000d1702', '00000000-0000-0000-0000-0000000000d1', 'Admin');
insert into public.employees (id, tenant_id, full_name) values
  ('00000000-0000-0000-0000-0000000d1e03', '00000000-0000-0000-0000-0000000000d1', 'Mira');
insert into public.employees (id, tenant_id, full_name, manager_id, job_role_id) values
  ('00000000-0000-0000-0000-0000000d1e04', '00000000-0000-0000-0000-0000000000d1', 'Aina', '00000000-0000-0000-0000-0000000d1e03', '00000000-0000-0000-0000-0000000d1701'),
  ('00000000-0000-0000-0000-0000000d1e05', '00000000-0000-0000-0000-0000000000d1', 'Ben', null, '00000000-0000-0000-0000-0000000d1702');
insert into public.memberships (tenant_id, user_id, role, employee_id) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000d1002', 'hr_admin', null),
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000d1003', 'manager', '00000000-0000-0000-0000-0000000d1e03'),
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000d1004', 'staff', '00000000-0000-0000-0000-0000000d1e04'),
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000d1005', 'staff', '00000000-0000-0000-0000-0000000d1e05');
insert into public.claim_types (id, tenant_id, name_en, name_ms, monthly_limit, per_claim_limit, is_taxable, is_mileage, requires_receipt, eligible_role_ids) values
  ('00000000-0000-0000-0000-0000000d1c01', '00000000-0000-0000-0000-0000000000d1', 'Parking', 'Letak kereta', 150, 100, false, false, true, '{}'),
  ('00000000-0000-0000-0000-0000000d1c02', '00000000-0000-0000-0000-0000000000d1', 'Phone bill', 'Bil telefon', 50, null, true, false, true, '{}'),
  ('00000000-0000-0000-0000-0000000d1c03', '00000000-0000-0000-0000-0000000000d1', 'Mileage', 'Perbatuan', 300, null, false, true, false, '{}'),
  ('00000000-0000-0000-0000-0000000d1c04', '00000000-0000-0000-0000-0000000000d1', 'Home visits', 'Lawatan rumah', null, null, false, false, false,
   '{00000000-0000-0000-0000-0000000d1701}');
-- Receipts the browser would have uploaded, one folder per claim.
insert into storage.objects (bucket_id, name) values
  ('receipts', '00000000-0000-0000-0000-0000000000d1/00000000-0000-0000-0000-0000000d1e04/00000000-0000-0000-0000-0000000d1a01/receipt.jpg'),
  ('receipts', '00000000-0000-0000-0000-0000000000d1/00000000-0000-0000-0000-0000000d1e04/00000000-0000-0000-0000-0000000d1a02/receipt.jpg'),
  ('receipts', '00000000-0000-0000-0000-0000000000d1/00000000-0000-0000-0000-0000000d1e04/00000000-0000-0000-0000-0000000d1a03/receipt.jpg'),
  ('receipts', '00000000-0000-0000-0000-0000000000d1/00000000-0000-0000-0000-0000000d1e04/00000000-0000-0000-0000-0000000d1a04/bill.pdf');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000d1004","role":"authenticated","aal":"aal1"}', true);

select throws_ok($$ select public.submit_claim('00000000-0000-0000-0000-0000000d1a09', '00000000-0000-0000-0000-0000000d1c01', public.malaysia_today(), 20, 'Parking') $$,
  '22023', null, 'a claim needs its receipt');
select throws_ok($$ select public.submit_claim('00000000-0000-0000-0000-0000000d1a01', '00000000-0000-0000-0000-0000000d1c01', public.malaysia_today(), 120, 'Parking') $$,
  '22023', null, 'above the per-claim limit (RM100) is refused');
select lives_ok($$ select public.submit_claim('00000000-0000-0000-0000-0000000d1a01', '00000000-0000-0000-0000-0000000d1c01', public.malaysia_today(), 90, 'Parking at hospital') $$,
  'a claim within its limits goes in');
select is((select count(*)::int from public.claim_receipts where claim_id = '00000000-0000-0000-0000-0000000d1a01'), 1,
  'the receipt is attached');
select throws_ok($$ select public.submit_claim('00000000-0000-0000-0000-0000000d1a02', '00000000-0000-0000-0000-0000000d1c01', public.malaysia_today(), 70, 'Parking again') $$,
  '22023', null, 'above the monthly limit (90 + 70 > 150) is refused');
select lives_ok($$ select public.submit_claim('00000000-0000-0000-0000-0000000d1a02', '00000000-0000-0000-0000-0000000d1c01', public.malaysia_today(), 60, 'Parking again') $$,
  'exactly up to the monthly limit is fine');
select throws_ok($$ select public.submit_claim('00000000-0000-0000-0000-0000000d1a05', '00000000-0000-0000-0000-0000000d1c03', public.malaysia_today(), null, 'Home visit', 12) $$,
  '22023', null, 'mileage needs the company rate per km first');
reset role;
update public.tenants set mileage_rate_per_km = 0.60 where id = '00000000-0000-0000-0000-0000000000d1';
set local role authenticated;
select lives_ok($$ select public.submit_claim('00000000-0000-0000-0000-0000000d1a05', '00000000-0000-0000-0000-0000000d1c03', public.malaysia_today(), 999, 'Home visit', 42.5, 'Centre', 'Client home') $$,
  'a mileage claim goes in');
select results_eq($$ select amount, distance_km, rate_per_km from public.claims where id = '00000000-0000-0000-0000-0000000d1a05' $$,
  $$ values (25.50::numeric(12,2), 42.5::numeric(8,1), 0.60::numeric(6,2)) $$, 'mileage is km × rate (42.5 × 0.60 = 25.50), whatever amount was typed');
select lives_ok($$ select public.submit_claim('00000000-0000-0000-0000-0000000d1a04', '00000000-0000-0000-0000-0000000d1c02', public.malaysia_today(), 45, 'Phone bill October') $$,
  'a taxable claim goes in');
select throws_ok($$ insert into storage.objects (bucket_id, name, owner_id) values ('receipts',
  '00000000-0000-0000-0000-0000000000d1/00000000-0000-0000-0000-0000000d1e04/00000000-0000-0000-0000-0000000d1a01/late.jpg',
  '00000000-0000-0000-0000-0000000d1004') $$, '42501', null, 'receipts cannot be added once a claim is sent');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000d1005","role":"authenticated","aal":"aal1"}', true);
select is((select count(*)::int from public.claims), 0, 'staff do not see other people''s claims');
select throws_ok($$ select public.submit_claim('00000000-0000-0000-0000-0000000d1a06', '00000000-0000-0000-0000-0000000d1c04', public.malaysia_today(), 10, 'Visit') $$,
  '22023', null, 'a claim type limited to other roles is refused');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000d1003","role":"authenticated","aal":"aal1"}', true);
select lives_ok($$ select public.act_on_approval(c.approval_id, 'approved', null) from public.claims c
  where c.id in ('00000000-0000-0000-0000-0000000d1a01', '00000000-0000-0000-0000-0000000d1a04') $$,
  'her manager approves two claims');
reset role;
select results_eq($$ select pay_item_code, amount, period_month = date_trunc('month', public.malaysia_today())::date
  from public.payroll_inputs where source = 'claims' order by pay_item_code $$,
  $$ values ('CLAIM_NON_TAXABLE', 90.00::numeric(12,2), true), ('CLAIM_TAXABLE', 45.00::numeric(12,2), true) $$,
  'approved claims become payroll inputs, taxable or not by type, for this month''s payroll');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000d1004","role":"authenticated","aal":"aal1"}', true);
select throws_ok($$ select public.cancel_claim('00000000-0000-0000-0000-0000000d1a01') $$, '42501', null,
  'staff cannot cancel an approved claim');
select lives_ok($$ select public.cancel_claim('00000000-0000-0000-0000-0000000d1a02') $$, 'but can cancel a pending one');

select * from finish();
rollback;
