-- Step 9 fix: leave can only be taken while employed (on or after the contract start
-- date, and not after it ends). Same apply_leave() otherwise.
create or replace function public.apply_leave(
  p_leave_type_id uuid,
  p_start date,
  p_end date,
  p_half_day text default null,
  p_reason text default null,
  p_attachment_path text default null,
  p_employee_id uuid default null,
  p_override_negative boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.app_role := public.auth_role();
  v_admin boolean := public.auth_role() in ('owner', 'hr_admin');
  v_employee_id uuid := coalesce(p_employee_id, public.auth_employee_id());
  v_employee public.employees;
  v_type public.leave_types;
  v_days numeric;
  v_year integer := extract(year from p_start)::int;
  v_balance public.leave_balances;
  v_available numeric;
  v_id uuid;
  v_approval_id uuid;
  v_sick_hosp numeric;
  v_service_start date;
  v_service_end date;
begin
  if v_employee_id is null then
    raise exception 'Your account is not linked to an employee record' using errcode = '42501',
      hint = 'not_linked';
  end if;
  if v_employee_id is distinct from public.auth_employee_id() and not v_admin then
    raise exception 'Only HR can record leave for someone else' using errcode = '42501';
  end if;
  if p_override_negative and not v_admin then
    raise exception 'Only HR can allow a negative balance' using errcode = '42501';
  end if;
  select * into v_employee from public.employees
  where id = v_employee_id and tenant_id = public.auth_tenant_id() and deleted_at is null;
  if not found or v_employee.status not in ('active', 'on_notice') then
    raise exception 'Employee not found' using errcode = 'P0002';
  end if;
  select * into v_type from public.leave_types
  where id = p_leave_type_id and tenant_id = v_employee.tenant_id and is_active;
  if not found then
    raise exception 'Leave type not found' using errcode = 'P0002';
  end if;
  select s.service_start, s.service_end into v_service_start, v_service_end
  from public.employee_service(v_employee_id) s;
  if v_service_start is null or p_start < v_service_start
     or (v_service_end is not null and p_end > v_service_end) then
    raise exception 'Leave must fall within the employment dates' using errcode = '22023',
      hint = 'outside_employment';
  end if;
  if p_end < p_start or extract(year from p_end)::int <> v_year then
    raise exception 'Leave must start and end in the same year' using errcode = '22023', hint = 'bad_dates';
  end if;
  if p_half_day is not null and (p_start <> p_end or p_half_day not in ('am', 'pm')) then
    raise exception 'A half day is a single day' using errcode = '22023', hint = 'bad_dates';
  end if;
  if v_type.gender is not null and v_employee.gender is distinct from v_type.gender then
    raise exception 'This leave type does not apply' using errcode = '22023', hint = 'not_eligible';
  end if;
  if exists (
    select 1 from public.leave_requests r
    where r.employee_id = v_employee_id and r.status in ('pending', 'approved')
      and r.start_date <= p_end and r.end_date >= p_start
  ) then
    raise exception 'This overlaps leave you already have' using errcode = '22023', hint = 'overlap';
  end if;
  if v_type.requires_attachment and not v_admin then
    if p_attachment_path is null or not exists (
      select 1 from storage.objects o
      where o.bucket_id = 'leave' and o.name = p_attachment_path
        and (storage.foldername(o.name))[1] = v_employee.tenant_id::text
        and (storage.foldername(o.name))[2] = v_employee_id::text
    ) then
      raise exception 'Attach the medical certificate' using errcode = '22023', hint = 'attachment_required';
    end if;
  end if;

  v_days := public.leave_days(v_employee_id, p_leave_type_id, p_start, p_end, p_half_day);
  if v_days <= 0 then
    raise exception 'These dates are not working days' using errcode = '22023', hint = 'no_working_days';
  end if;

  perform public.refresh_leave_balances(v_employee_id, v_year);
  select * into v_balance from public.leave_balances
  where employee_id = v_employee_id and leave_type_id = p_leave_type_id and year = v_year;
  v_available := public.leave_available(v_balance);
  if v_type.code = 'HOSPITALISATION' then
    -- Sick and hospitalisation leave together stay within the hospitalisation days (60).
    select coalesce(sum(b.taken + b.pending), 0) into v_sick_hosp
    from public.leave_balances b join public.leave_types t on t.id = b.leave_type_id
    where b.employee_id = v_employee_id and b.year = v_year and t.code = 'SICK';
    v_available := least(v_available, v_balance.entitled + v_balance.adjusted - v_sick_hosp - v_balance.taken - v_balance.pending);
  end if;
  if v_available is not null and v_available - v_days < 0 and not p_override_negative then
    raise exception 'Not enough leave left (% days)', v_available using errcode = '22023',
      hint = 'insufficient_balance', detail = v_available::text;
  end if;

  insert into public.leave_requests (employee_id, leave_type_id, start_date, end_date, half_day,
    days, reason, attachment_path, status, override_negative, decided_at, decided_by)
  values (v_employee_id, p_leave_type_id, p_start, p_end, p_half_day, v_days,
    nullif(btrim(p_reason), ''), p_attachment_path,
    case when v_admin and v_employee_id is distinct from public.auth_employee_id() then 'approved' else 'pending' end,
    p_override_negative,
    case when v_admin and v_employee_id is distinct from public.auth_employee_id() then now() end,
    case when v_admin and v_employee_id is distinct from public.auth_employee_id() then auth.uid() end)
  returning id into v_id;

  if v_admin and v_employee_id is distinct from public.auth_employee_id() then
    perform public.leave_after_approval(v_id);
  else
    v_approval_id := public.create_approval('leave', v_id, public.leave_approval_steps(v_employee_id));
    update public.leave_requests set approval_id = v_approval_id where id = v_id;
  end if;
  perform public.recount_leave_balance(v_employee_id, p_leave_type_id, v_year);
  return v_id;
end;
$$;
