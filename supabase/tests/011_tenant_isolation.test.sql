-- FND-02: a user of tenant A cannot read or change anything that belongs to tenant B.
begin;
create extension if not exists pgtap with schema extensions;

select plan(10);

-- Fixtures (as postgres, bypassing RLS)
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000a001', 'owner-a@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000b001', 'owner-b@example.test', 'authenticated', 'authenticated');
insert into public.tenants (id, legal_name) values
  ('00000000-0000-0000-0000-0000000000a0', 'Tenant A Sdn Bhd'),
  ('00000000-0000-0000-0000-0000000000b0', 'Tenant B Sdn Bhd');
insert into public.branches (tenant_id, name) values
  ('00000000-0000-0000-0000-0000000000a0', 'A branch'),
  ('00000000-0000-0000-0000-0000000000b0', 'B branch');
insert into public.memberships (tenant_id, user_id, role) values
  ('00000000-0000-0000-0000-0000000000a0', '00000000-0000-0000-0000-00000000a001', 'owner'),
  ('00000000-0000-0000-0000-0000000000b0', '00000000-0000-0000-0000-00000000b001', 'owner');
insert into public.approvals (id, tenant_id, entity_type, entity_id, requested_by) values
  ('00000000-0000-0000-0000-0000000ab0b0', '00000000-0000-0000-0000-0000000000b0', 'test',
   gen_random_uuid(), '00000000-0000-0000-0000-00000000b001');
insert into public.approval_steps (tenant_id, approval_id, step_no, approver_role) values
  ('00000000-0000-0000-0000-0000000000b0', '00000000-0000-0000-0000-0000000ab0b0', 1, 'owner');
select public.notify('00000000-0000-0000-0000-00000000b001', 'test');

-- Act as tenant A's owner, after MFA
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000a001","role":"authenticated","aal":"aal2"}', true);

select is((select count(*)::int from public.tenants), 1, 'A sees exactly one tenant');
select is((select count(*)::int from public.tenants where id = '00000000-0000-0000-0000-0000000000b0'), 0, 'A cannot read tenant B');
select is((select count(*)::int from public.branches where tenant_id = '00000000-0000-0000-0000-0000000000b0'), 0, 'A cannot read B branches');
select is((select count(*)::int from public.memberships where tenant_id = '00000000-0000-0000-0000-0000000000b0'), 0, 'A cannot read B memberships');
select is((select count(*)::int from public.approvals where tenant_id = '00000000-0000-0000-0000-0000000000b0'), 0, 'A cannot read B approvals');
select is((select count(*)::int from public.approval_steps where tenant_id = '00000000-0000-0000-0000-0000000000b0'), 0, 'A cannot read B approval steps');
select is((select count(*)::int from public.notifications where tenant_id = '00000000-0000-0000-0000-0000000000b0'), 0, 'A cannot read B notifications');
select is((select count(*)::int from public.audit_log where tenant_id = '00000000-0000-0000-0000-0000000000b0'), 0, 'A cannot read B audit log');

with changed as (
  update public.tenants set legal_name = 'hijacked'
  where id = '00000000-0000-0000-0000-0000000000b0' returning 1
)
select is((select count(*)::int from changed), 0, 'A cannot update tenant B');

select throws_ok(
  $$ select public.act_on_approval('00000000-0000-0000-0000-0000000ab0b0', 'approved') $$,
  'P0002', 'Approval not found',
  'A cannot act on a tenant B approval'
);

select * from finish();
rollback;
