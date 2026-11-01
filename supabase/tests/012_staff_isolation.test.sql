-- FND-02: staff see only their own rows (data-model.md §5), never another staff member's.
begin;
create extension if not exists pgtap with schema extensions;

select plan(8);

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000c001', 'staff-1@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000c002', 'staff-2@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000c003', 'hr@example.test', 'authenticated', 'authenticated');
insert into public.tenants (id, legal_name) values ('00000000-0000-0000-0000-0000000000c0', 'Tenant C');
insert into public.memberships (tenant_id, user_id, role) values
  ('00000000-0000-0000-0000-0000000000c0', '00000000-0000-0000-0000-00000000c001', 'staff'),
  ('00000000-0000-0000-0000-0000000000c0', '00000000-0000-0000-0000-00000000c002', 'staff'),
  ('00000000-0000-0000-0000-0000000000c0', '00000000-0000-0000-0000-00000000c003', 'hr_admin');
insert into public.approvals (tenant_id, entity_type, entity_id, requested_by) values
  ('00000000-0000-0000-0000-0000000000c0', 'test', gen_random_uuid(), '00000000-0000-0000-0000-00000000c001'),
  ('00000000-0000-0000-0000-0000000000c0', 'test', gen_random_uuid(), '00000000-0000-0000-0000-00000000c002');
select public.notify('00000000-0000-0000-0000-00000000c001', 'test');
select public.notify('00000000-0000-0000-0000-00000000c002', 'test');

-- Act as staff 1 (staff do not need MFA)
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000c001","role":"authenticated","aal":"aal1"}', true);

select is((select count(*)::int from public.memberships), 1, 'staff see only their own membership');
select is((select count(*)::int from public.memberships where user_id = '00000000-0000-0000-0000-00000000c002'), 0, 'staff cannot read another staff membership');
select is((select count(*)::int from public.notifications), 1, 'staff see only their own notifications');
select is((select count(*)::int from public.approvals where requested_by = '00000000-0000-0000-0000-00000000c002'), 0, 'staff cannot read another staff approval');
select is((select count(*)::int from public.approvals), 1, 'staff see their own approval');
select is((select count(*)::int from public.audit_log), 0, 'staff cannot read the audit log');

select throws_ok(
  $$ select public.notify('00000000-0000-0000-0000-00000000c002', 'test') $$,
  '42501', null, 'staff cannot send notifications to others'
);
select throws_ok(
  $$ insert into public.memberships (tenant_id, invited_email, role)
     values ('00000000-0000-0000-0000-0000000000c0', 'me-as-owner@example.test', 'owner') $$,
  '42501', null, 'staff cannot create memberships'
);

select * from finish();
rollback;
