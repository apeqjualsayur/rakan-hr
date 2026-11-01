-- FND-03 approval engine, MFA gate for privileged roles, and the invite-only sign-up hook.
begin;
create extension if not exists pgtap with schema extensions;

select plan(16);

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000e001', 'owner-e@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000e002', 'staff-e@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000e003', 'manager-e@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000e004', 'hr-e@example.test', 'authenticated', 'authenticated');
insert into public.tenants (id, legal_name) values ('00000000-0000-0000-0000-0000000000e0', 'Tenant E');
insert into public.memberships (tenant_id, user_id, role) values
  ('00000000-0000-0000-0000-0000000000e0', '00000000-0000-0000-0000-00000000e001', 'owner'),
  ('00000000-0000-0000-0000-0000000000e0', '00000000-0000-0000-0000-00000000e002', 'staff'),
  ('00000000-0000-0000-0000-0000000000e0', '00000000-0000-0000-0000-00000000e003', 'manager'),
  ('00000000-0000-0000-0000-0000000000e0', '00000000-0000-0000-0000-00000000e004', 'hr_admin');

set local role authenticated;

-- MFA gate
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000e001","role":"authenticated","aal":"aal1"}', true);
select is(public.auth_role(), null, 'owner without MFA has no role');
select is((select count(*)::int from public.tenants), 0, 'owner without MFA reads no tenant data');
select is((select count(*)::int from public.memberships), 1, 'owner without MFA can still read their own membership');
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000e001","role":"authenticated","aal":"aal2"}', true);
select is(public.auth_role(), 'owner'::public.app_role, 'owner after MFA has the owner role');

-- Staff requests a two-step approval: manager, then HR admin
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000e002","role":"authenticated","aal":"aal1"}', true);
select public.create_approval('test', '00000000-0000-0000-0000-0000000e0e01',
  '[{"role":"manager"},{"role":"hr_admin"}]');

reset role;
select is(
  (select count(*)::int from public.notifications
   where user_id = '00000000-0000-0000-0000-00000000e003' and template = 'approval_requested'),
  1, 'step 1 approver (manager) is notified'
);
select is(
  (select count(*)::int from public.notifications
   where user_id = '00000000-0000-0000-0000-00000000e004'),
  0, 'step 2 approver is not notified yet'
);
set local role authenticated;

select throws_ok(
  $$ select public.act_on_approval(
       (select id from public.approvals where entity_id = '00000000-0000-0000-0000-0000000e0e01'),
       'approved') $$,
  '42501', 'You cannot approve your own request', 'requester cannot approve their own request'
);

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000e004","role":"authenticated","aal":"aal2"}', true);
select throws_ok(
  $$ select public.act_on_approval(
       (select id from public.approvals where entity_id = '00000000-0000-0000-0000-0000000e0e01'),
       'approved') $$,
  '42501', 'You are not an approver for this step', 'HR cannot act on the manager step'
);

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000e003","role":"authenticated","aal":"aal1"}', true);
select is(
  public.act_on_approval(
    (select id from public.approvals where entity_id = '00000000-0000-0000-0000-0000000e0e01'),
    'approved', 'Fine by me'),
  'pending', 'manager approves step 1; approval moves on'
);

reset role;
select is(
  (select count(*)::int from public.notifications
   where user_id = '00000000-0000-0000-0000-00000000e004' and template = 'approval_requested'),
  1, 'step 2 approver (HR) is notified next'
);
set local role authenticated;

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000e004","role":"authenticated","aal":"aal2"}', true);
select throws_ok(
  $$ select public.act_on_approval(
       (select id from public.approvals where entity_id = '00000000-0000-0000-0000-0000000e0e01'),
       'rejected', '  ') $$,
  '22023', 'A comment is required to reject', 'rejecting needs a comment'
);
select is(
  public.act_on_approval(
    (select id from public.approvals where entity_id = '00000000-0000-0000-0000-0000000e0e01'),
    'rejected', 'Missing receipt'),
  'rejected', 'HR rejects step 2 with a comment'
);

reset role;
select is(
  (select data ->> 'comment' from public.notifications
   where user_id = '00000000-0000-0000-0000-00000000e002' and template = 'approval_decided'),
  'Missing receipt', 'requester is told the decision and the comment'
);

-- Invite-only sign-up hook and invite linking
insert into public.memberships (tenant_id, invited_email, role) values
  ('00000000-0000-0000-0000-0000000000e0', 'invited-e@example.test', 'staff');
select is(
  public.hook_before_user_created('{"user":{"email":"Invited-E@example.test"}}'),
  '{}'::jsonb, 'sign-up hook allows an invited email'
);
select is(
  public.hook_before_user_created('{"user":{"email":"stranger@example.test"}}') -> 'error' ->> 'http_code',
  '403', 'sign-up hook rejects an uninvited email'
);
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000e005', 'invited-e@example.test', 'authenticated', 'authenticated');
select is(
  (select user_id from public.memberships where invited_email = 'invited-e@example.test'),
  '00000000-0000-0000-0000-00000000e005'::uuid, 'first sign-in links the invite to the new user'
);

select * from finish();
rollback;
