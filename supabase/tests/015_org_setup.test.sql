-- ORG-01 → ORG-04: checklist seeding and deadlines, evidence marks done, who can read and
-- change company settings, the company evidence bucket, and the Users-screen rules.
begin;
create extension if not exists pgtap with schema extensions;

select plan(31);

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000f001', 'owner-f@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000f002', 'hr-f@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000f003', 'auditor-f@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000f004', 'staff-f@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000f005', 'owner2-f@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000c001', 'owner-g@example.test', 'authenticated', 'authenticated');
insert into public.tenants (id, legal_name, first_hire_date, first_payday_date) values
  ('00000000-0000-0000-0000-0000000000f0', 'Tenant F', '2026-12-01', '2026-12-28'),
  ('00000000-0000-0000-0000-0000000000c0', 'Tenant G', null, null);
insert into public.memberships (id, tenant_id, user_id, role) values
  ('00000000-0000-0000-0000-0000000f0e01', '00000000-0000-0000-0000-0000000000f0', '00000000-0000-0000-0000-00000000f001', 'owner'),
  ('00000000-0000-0000-0000-0000000f0e02', '00000000-0000-0000-0000-0000000000f0', '00000000-0000-0000-0000-00000000f002', 'hr_admin'),
  ('00000000-0000-0000-0000-0000000f0e03', '00000000-0000-0000-0000-0000000000f0', '00000000-0000-0000-0000-00000000f003', 'auditor'),
  ('00000000-0000-0000-0000-0000000f0e04', '00000000-0000-0000-0000-0000000000f0', '00000000-0000-0000-0000-00000000f004', 'staff'),
  ('00000000-0000-0000-0000-0000000f0e05', '00000000-0000-0000-0000-0000000000f0', '00000000-0000-0000-0000-00000000f005', 'owner'),
  ('00000000-0000-0000-0000-0000000c0e01', '00000000-0000-0000-0000-0000000000c0', '00000000-0000-0000-0000-00000000c001', 'owner');

-- Seeding and deadlines (as postgres)
select is(
  (select count(*)::int from public.setup_checklist_items where tenant_id = '00000000-0000-0000-0000-0000000000f0'),
  7, 'a new company gets the 7 Employer Setup Checklist items'
);
select results_eq(
  $$ select code, due_date from public.setup_checklist_items
     where tenant_id = '00000000-0000-0000-0000-0000000000f0' order by sort_order $$,
  $$ values ('EPF_REGISTRATION', '2026-12-08'::date), ('SOCSO_REGISTRATION', '2026-12-31'::date),
            ('LHDN_E_NUMBER', '2026-12-28'::date), ('PAYROLL_BANK_ACCOUNT', '2026-12-21'::date),
            ('PDPA_PRIVACY_NOTICE', '2026-12-01'::date), ('DPO_APPOINTED', null::date),
            ('HRDCORP_REGISTRATION', null::date) $$,
  'deadlines count from the first hire and first payday dates'
);
select is(
  (select status::text from public.setup_checklist_items
   where tenant_id = '00000000-0000-0000-0000-0000000000f0' and code = 'HRDCORP_REGISTRATION'),
  'not_applicable', 'HRD Corp starts as not applicable when there is no HRD Corp number'
);
select is(
  (select count(*)::int from public.setup_checklist_items
   where tenant_id = '00000000-0000-0000-0000-0000000000c0' and due_date is not null),
  0, 'without a first hire date there are no rule-based deadlines yet'
);

update public.tenants set first_hire_date = '2027-01-04' where id = '00000000-0000-0000-0000-0000000000f0';
select is(
  (select due_date from public.setup_checklist_items
   where tenant_id = '00000000-0000-0000-0000-0000000000f0' and code = 'EPF_REGISTRATION'),
  '2027-01-11'::date, 'moving the first hire date moves the deadlines'
);

set local role authenticated;

-- Owner (after MFA)
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000f001","role":"authenticated","aal":"aal2"}', true);

select is(
  (select count(*)::int from public.setup_checklist_items), 7,
  'owner sees only their own company checklist'
);

update public.setup_checklist_items set evidence_file_path = '00000000-0000-0000-0000-0000000000f0/setup-checklist/x/epf.pdf'
where code = 'EPF_REGISTRATION';
select is(
  (select status::text || ' by ' || completed_by::text from public.setup_checklist_items where code = 'EPF_REGISTRATION'),
  'done by 00000000-0000-0000-0000-00000000f001', 'uploading evidence marks the item done, by whom'
);
update public.setup_checklist_items set status = 'in_progress' where code = 'EPF_REGISTRATION';
select ok(
  (select completed_at is null and completed_by is null from public.setup_checklist_items where code = 'EPF_REGISTRATION'),
  'moving away from done clears the completion'
);

update public.setup_checklist_items set due_date = '2000-01-01' where code = 'EPF_REGISTRATION';
select is(
  (select due_date from public.setup_checklist_items where code = 'EPF_REGISTRATION'),
  '2027-01-11'::date, 'a rule-based deadline cannot be overwritten by hand'
);
update public.setup_checklist_items set due_date = '2027-02-01' where code = 'DPO_APPOINTED';
select is(
  (select due_date from public.setup_checklist_items where code = 'DPO_APPOINTED'),
  '2027-02-01'::date, 'an item without a rule takes a typed due date'
);

select throws_ok(
  $$ update public.setup_checklist_items set code = 'X' where code = 'DPO_APPOINTED' $$,
  '42501', null, 'item codes cannot be changed'
);
select throws_ok(
  $$ delete from public.setup_checklist_items $$,
  '42501', null, 'checklist items cannot be deleted'
);

-- Company profile: owner edits; HR and auditor cannot
with changed as (
  update public.tenants set ssm_no = '202601000001' where id = '00000000-0000-0000-0000-0000000000f0' returning 1
)
select is((select count(*)::int from changed), 1, 'owner can edit the company profile');

-- Users screen rules (owner)
select lives_ok(
  $$ update public.memberships set role = 'hr_admin' where id = '00000000-0000-0000-0000-0000000f0e05' $$,
  'owner can change a role while another owner remains'
);
select throws_ok(
  $$ update public.memberships set is_active = false where id = '00000000-0000-0000-0000-0000000f0e01' $$,
  '23514', 'The company must keep at least one active Owner',
  'the last active owner cannot be deactivated'
);
select throws_ok(
  $$ update public.memberships set role = 'staff' where id = '00000000-0000-0000-0000-0000000f0e01' $$,
  '23514', 'The company must keep at least one active Owner',
  'the last active owner cannot be demoted'
);
with removed as (
  delete from public.memberships where id = '00000000-0000-0000-0000-0000000f0e04' returning 1
)
select is((select count(*)::int from removed), 0, 'a member who has signed in cannot be deleted (only deactivated)');

insert into public.memberships (id, tenant_id, invited_email, role) values
  ('00000000-0000-0000-0000-0000000f0e09', '00000000-0000-0000-0000-0000000000f0', 'accountant@example.test', 'auditor');
select lives_ok(
  $$ select public.resend_invite('00000000-0000-0000-0000-0000000f0e09') $$,
  'owner can resend an invite'
);
select throws_ok(
  $$ select public.resend_invite('00000000-0000-0000-0000-0000000c0e01') $$,
  'P0002', 'Invite not found', 'owner cannot resend invites of another company'
);
with removed as (
  delete from public.memberships where id = '00000000-0000-0000-0000-0000000f0e09' returning 1
)
select is((select count(*)::int from removed), 1, 'a pending invite can be removed');

-- Evidence bucket
select lives_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values ('company', '00000000-0000-0000-0000-0000000000f0/setup-checklist/x/epf.pdf', '00000000-0000-0000-0000-00000000f001') $$,
  'owner can upload company evidence'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values ('company', '00000000-0000-0000-0000-0000000000c0/setup-checklist/x/epf.pdf', '00000000-0000-0000-0000-00000000f001') $$,
  '42501', null, 'owner cannot upload into another company''s folder'
);

-- HR admin (after MFA)
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000f002","role":"authenticated","aal":"aal2"}', true);
with changed as (
  update public.setup_checklist_items set status = 'in_progress' where code = 'SOCSO_REGISTRATION' returning 1
)
select is((select count(*)::int from changed), 1, 'HR admin can update the checklist');
with changed as (
  update public.tenants set ssm_no = 'hr' where id = '00000000-0000-0000-0000-0000000000f0' returning 1
)
select is((select count(*)::int from changed), 0, 'HR admin cannot edit the company profile');
select throws_ok(
  $$ insert into public.memberships (tenant_id, invited_email, role)
     values ('00000000-0000-0000-0000-0000000000f0', 'x@example.test', 'staff') $$,
  '42501', null, 'HR admin cannot invite users'
);

-- Auditor (read-only; no MFA needed)
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000f003","role":"authenticated","aal":"aal1"}', true);
select is((select count(*)::int from public.setup_checklist_items), 7, 'auditor can read the checklist');
with changed as (
  update public.setup_checklist_items set status = 'done' where code = 'DPO_APPOINTED' returning 1
)
select is((select count(*)::int from changed), 0, 'auditor cannot change the checklist');
select is(
  (select count(*)::int from storage.objects where bucket_id = 'company'), 1,
  'auditor can see the company evidence file'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values ('company', '00000000-0000-0000-0000-0000000000f0/setup-checklist/x/a.pdf', '00000000-0000-0000-0000-00000000f003') $$,
  '42501', null, 'auditor cannot upload evidence'
);

-- Staff
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000f004","role":"authenticated","aal":"aal1"}', true);
select is((select count(*)::int from public.setup_checklist_items), 0, 'staff cannot read the checklist');
select is(
  (select count(*)::int from storage.objects where bucket_id = 'company'), 0,
  'staff cannot see company evidence files'
);

select * from finish();
rollback;
