-- FND-02 / FND-04 guard rails: every public table has RLS on, and every 🔒 table built so
-- far has the audit trigger. Add each new 🔒 table to the list below in its build step.
begin;
create extension if not exists pgtap with schema extensions;

select plan(2);

select is(
  array(
    select tablename::text from pg_tables
    where schemaname = 'public' and not rowsecurity
    order by 1
  ),
  '{}'::text[],
  'every table in public has row level security enabled'
);

select is(
  array(
    select t.name from unnest(array[
      'memberships',
      'employees',
      'employment_records',
      'bank_accounts',
      'staff_credentials',
      'credential_verifications',
      'cpd_activities',
      'signatures',
      'candidates',
      'offers',
      'probation_reviews',
      'leave_requests'
    ]) as t (name)
    where not exists (
      select 1 from pg_trigger tr
      where tr.tgrelid = ('public.' || t.name)::regclass
        and tr.tgname = 'audit_log_changes'
    )
    order by 1
  ),
  '{}'::text[],
  'every locked (🔒) table has the audit trigger'
);

select * from finish();
rollback;
