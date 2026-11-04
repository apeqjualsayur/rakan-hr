-- Step 9 fix: holiday_calendar() is read-only (it is used inside leave_days() and other
-- stable functions), so it cannot use a temporary table. Same result, built in memory.
create or replace function public.holiday_calendar(
  p_tenant_id uuid,
  p_state_code text,
  p_from date,
  p_to date
)
returns table (holiday_date date, name_en text, name_ms text, is_replacement boolean,
  replaces date, is_provisional boolean, is_company boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tenant public.tenants;
  v_h record;
  v_day date;
  v_taken date[];
begin
  select * into v_tenant from public.tenants where id = p_tenant_id;
  -- A holiday on a rest day just before the range can be replaced inside it.
  select coalesce(array_agg(distinct h.holiday_date), '{}') into v_taken
  from public.public_holidays h
  where h.holiday_date between p_from - 14 and p_to + 14
    and (h.state_code = 'ALL' or h.state_code = p_state_code)
    and (h.tenant_id is null or h.tenant_id = p_tenant_id);

  for v_h in
    select h.holiday_date as d, h.name_en as en, h.name_ms as ms, h.is_provisional as prov,
           h.tenant_id is not null as company
    from public.public_holidays h
    where h.holiday_date between p_from - 14 and p_to + 14
      and (h.state_code = 'ALL' or h.state_code = p_state_code)
      and (h.tenant_id is null or h.tenant_id = p_tenant_id)
    order by h.holiday_date, h.name_en
  loop
    if v_h.d between p_from and p_to then
      holiday_date := v_h.d; name_en := v_h.en; name_ms := v_h.ms; is_replacement := false;
      replaces := null; is_provisional := v_h.prov; is_company := v_h.company;
      return next;
    end if;
    if extract(dow from v_h.d)::smallint = v_tenant.rest_day then
      v_day := v_h.d + 1;
      while extract(dow from v_day)::smallint = v_tenant.rest_day
         or extract(dow from v_day)::smallint = any (v_tenant.off_days)
         or v_day = any (v_taken) loop
        v_day := v_day + 1;
      end loop;
      v_taken := v_taken || v_day;
      if v_day between p_from and p_to then
        holiday_date := v_day; name_en := v_h.en || ' (replacement)'; name_ms := v_h.ms || ' (ganti)';
        is_replacement := true; replaces := v_h.d; is_provisional := v_h.prov; is_company := v_h.company;
        return next;
      end if;
    end if;
  end loop;
end;
$$;
