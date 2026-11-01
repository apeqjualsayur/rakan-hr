-- Proves pgTAP runs. Real RLS and payroll tests are added with each migration.
begin;
create extension if not exists pgtap with schema extensions;

select plan(2);

select ok(true, 'pgTAP is wired up');
select cmp_ok(
  current_setting('server_version_num')::int, '>=', 170000,
  'dev project runs Postgres 17 or newer'
);

select * from finish();
rollback;
