-- FND-04: insert, update and delete on a locked (🔒) table each write an audit row
-- (who, when, before/after).
begin;
create extension if not exists pgtap with schema extensions;

select plan(8);

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000d001', 'owner-d@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000d002', 'staff-d@example.test', 'authenticated', 'authenticated');
insert into public.tenants (id, legal_name) values ('00000000-0000-0000-0000-0000000000d0', 'Tenant D');
insert into public.memberships (tenant_id, user_id, role) values
  ('00000000-0000-0000-0000-0000000000d0', '00000000-0000-0000-0000-00000000d001', 'owner'),
  ('00000000-0000-0000-0000-0000000000d0', '00000000-0000-0000-0000-00000000d002', 'staff');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000d001","role":"authenticated","aal":"aal2"}', true);

insert into public.memberships (id, tenant_id, invited_email, role) values
  ('00000000-0000-0000-0000-0000000d0e01', '00000000-0000-0000-0000-0000000000d0', 'new-hire@example.test', 'staff');
update public.memberships set role = 'manager' where id = '00000000-0000-0000-0000-0000000d0e01';
delete from public.memberships where id = '00000000-0000-0000-0000-0000000d0e01';

select results_eq(
  $$ select action from public.audit_log
     where row_id = '00000000-0000-0000-0000-0000000d0e01' order by id $$,
  array['INSERT', 'UPDATE', 'DELETE'],
  'insert, update and delete are each audited'
);
select is(
  (select count(*)::int from public.audit_log
   where row_id = '00000000-0000-0000-0000-0000000d0e01'
     and actor_id = '00000000-0000-0000-0000-00000000d001'
     and tenant_id = '00000000-0000-0000-0000-0000000000d0'),
  3, 'audit rows record the actor and tenant'
);
select is(
  (select (old_data ->> 'role') || ' to ' || (new_data ->> 'role') from public.audit_log
   where row_id = '00000000-0000-0000-0000-0000000d0e01' and action = 'UPDATE'),
  'staff to manager', 'update keeps before and after values'
);
select ok(
  (select new_data is null and old_data ->> 'invited_email' = 'new-hire@example.test'
   from public.audit_log
   where row_id = '00000000-0000-0000-0000-0000000d0e01' and action = 'DELETE'),
  'delete keeps the removed row'
);

select throws_ok(
  $$ update public.audit_log set actor_id = null $$,
  '42501', null, 'audit log cannot be edited, even by the owner'
);
select throws_ok(
  $$ delete from public.audit_log $$,
  '42501', null, 'audit log cannot be deleted, even by the owner'
);

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000d002","role":"authenticated","aal":"aal1"}', true);
select throws_ok(
  $$ insert into public.audit_log (table_name, action) values ('public.memberships', 'INSERT') $$,
  '42501', null, 'staff cannot write the audit log'
);
select is((select count(*)::int from public.audit_log), 0, 'staff cannot read the audit log');

select * from finish();
rollback;
