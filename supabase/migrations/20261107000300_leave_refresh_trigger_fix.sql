-- Step 9 fix: one trigger function cannot read new.id on employees and new.employee_id on
-- employment_records (PL/pgSQL resolves both). Split into one function per table.
create or replace function public.leave_refresh_for(p_employee_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.employees e
             where e.id = p_employee_id and e.status in ('active', 'on_notice') and e.deleted_at is null) then
    perform public.refresh_leave_balances(p_employee_id, extract(year from public.malaysia_today())::int);
  end if;
end;
$$;
revoke execute on function public.leave_refresh_for(uuid) from public, anon, authenticated;

create or replace function public.leave_refresh_on_contract()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.leave_refresh_for(new.employee_id);
  return null;
end;
$$;

create or replace function public.leave_refresh_on_employee()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.leave_refresh_for(new.id);
  return null;
end;
$$;

drop trigger employment_records_refresh_leave on public.employment_records;
drop trigger employees_refresh_leave on public.employees;
drop function public.leave_refresh_trigger();
create trigger employment_records_refresh_leave
  after insert or update of start_date, end_date, is_current on public.employment_records
  for each row execute function public.leave_refresh_on_contract();
create trigger employees_refresh_leave
  after update of status, gender on public.employees
  for each row execute function public.leave_refresh_on_employee();
