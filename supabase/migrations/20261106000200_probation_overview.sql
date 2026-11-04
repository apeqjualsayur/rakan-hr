-- Step 8 (HIR-07): what a reviewer needs to see before reviewing someone's probation.
-- Managers cannot read employees or employment_records directly (only their own), so the
-- review page gets the name, title and probation dates through this function, for people
-- they may review (can_review_probation).
create or replace function public.probation_overview(p_employee_id uuid)
returns table (
  employee_id uuid,
  full_name text,
  job_title text,
  start_date date,
  probation_end date,
  confirmed_on date
)
language sql
stable
security definer
set search_path = ''
as $$
  select e.id, e.full_name,
         coalesce(e.job_title, (select j.name from public.job_roles j where j.id = e.job_role_id)),
         r.start_date, r.probation_end, r.confirmed_on
  from public.employees e
  left join public.employment_records r on r.employee_id = e.id and r.is_current
  where e.id = p_employee_id
    and e.deleted_at is null
    and public.can_review_probation(e.id);
$$;
revoke execute on function public.probation_overview(uuid) from public, anon;
grant execute on function public.probation_overview(uuid) to authenticated;
