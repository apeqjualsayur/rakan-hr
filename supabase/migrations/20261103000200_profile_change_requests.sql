-- Step 5 (EMP-07): staff ask for changes to their own contact details, emergency contact or
-- bank account; HR approves through the approval engine (FND-03) and the change is applied
-- by the database when the approval is decided. Bank changes are always reviewed by HR and
-- use their own approval type ('bank_change') so they are flagged everywhere.

create table public.profile_change_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  field text not null check (field in ('phone', 'email', 'address', 'emergency_contact', 'bank_account')),
  -- Never holds a full account number: bank values keep bank, holder and last 4 digits only.
  old_value jsonb,
  new_value jsonb not null,
  note text check (char_length(note) <= 500),
  bank_account_id uuid references public.bank_accounts (id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  approval_id uuid references public.approvals (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create index profile_change_requests_tenant_idx
  on public.profile_change_requests (tenant_id, created_at desc);
create unique index profile_change_requests_one_pending
  on public.profile_change_requests (employee_id, field) where status = 'pending';

create trigger profile_change_requests_set_updated_at before update on public.profile_change_requests
  for each row execute function public.set_updated_at();

alter table public.profile_change_requests enable row level security;
revoke all on public.profile_change_requests from anon;

-- The employee sees their own requests; owner, HR admin and auditor see all.
-- Rows are written only by request_profile_change() and the approval trigger below.
create policy profile_change_requests_select on public.profile_change_requests
  for select to authenticated
  using (
    tenant_id = public.auth_tenant_id()
    and (
      public.auth_role() in ('owner', 'hr_admin', 'auditor')
      or employee_id = public.auth_employee_id()
    )
  );
revoke insert, update, delete on public.profile_change_requests from authenticated;

-- Who reviews: the HR admin role, or the owner when the company has no active HR admin
-- (so the request never sits with nobody notified).
create or replace function public.profile_change_reviewer(p_tenant_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_array(jsonb_build_object('role',
    case when exists (
      select 1 from public.memberships m
      where m.tenant_id = p_tenant_id and m.role = 'hr_admin' and m.is_active and m.user_id is not null
    ) then 'hr_admin' else 'owner' end
  ));
$$;

revoke execute on function public.profile_change_reviewer(uuid) from public, anon, authenticated;

-- p_value by field:
--   phone / email / address   {"value": "<text>"}
--   emergency_contact         {"name": "", "relationship": "", "phone": ""}
--   bank_account              {"bank_code": "MBB", "account_no": "…", "holder_name": ""}
-- Returns the request id.
create or replace function public.request_profile_change(
  p_field text,
  p_value jsonb,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_employee public.employees;
  v_value text;
  v_old jsonb;
  v_new jsonb;
  v_bank_account_id uuid;
  v_current public.bank_accounts;
  v_request_id uuid;
  v_approval_id uuid;
begin
  select * into v_employee from public.employees
  where id = public.auth_employee_id() and tenant_id = public.auth_tenant_id()
    and deleted_at is null;
  if not found then
    raise exception 'Your account is not linked to an employee record' using errcode = '42501';
  end if;
  if p_value is null or jsonb_typeof(p_value) <> 'object' then
    raise exception 'A new value is required' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.profile_change_requests
    where employee_id = v_employee.id and field = p_field and status = 'pending'
  ) then
    raise exception 'A change to this is already waiting for HR' using errcode = '23505',
      hint = 'pending_exists';
  end if;

  case p_field
    when 'phone' then
      v_value := btrim(p_value ->> 'value');
      if v_value is null or v_value !~ '^\+?[0-9][0-9 -]{5,19}$' then
        raise exception 'Enter a valid phone number' using errcode = '22023';
      end if;
      v_old := jsonb_build_object('value', v_employee.phone);
      v_new := jsonb_build_object('value', v_value);
    when 'email' then
      v_value := lower(btrim(p_value ->> 'value'));
      if v_value is null or v_value !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' or char_length(v_value) > 254 then
        raise exception 'Enter a valid email address' using errcode = '22023';
      end if;
      v_old := jsonb_build_object('value', v_employee.email);
      v_new := jsonb_build_object('value', v_value);
    when 'address' then
      v_value := btrim(p_value ->> 'value');
      if v_value is null or v_value = '' or char_length(v_value) > 500 then
        raise exception 'Enter an address' using errcode = '22023';
      end if;
      v_old := jsonb_build_object('value', v_employee.address);
      v_new := jsonb_build_object('value', v_value);
    when 'emergency_contact' then
      v_new := jsonb_build_object(
        'name', btrim(p_value ->> 'name'),
        'relationship', btrim(p_value ->> 'relationship'),
        'phone', btrim(p_value ->> 'phone')
      );
      if coalesce(v_new ->> 'name', '') = '' or coalesce(v_new ->> 'phone', '') !~ '^\+?[0-9][0-9 -]{5,19}$' then
        raise exception 'An emergency contact needs a name and a phone number' using errcode = '22023';
      end if;
      v_old := v_employee.emergency_contact;
    when 'bank_account' then
      if coalesce(btrim(p_value ->> 'holder_name'), '') = '' then
        raise exception 'Enter the account holder name' using errcode = '22023';
      end if;
      select * into v_current from public.bank_accounts
      where employee_id = v_employee.id and is_primary;
      -- The proposed account is stored encrypted, waiting for HR; it pays nothing until approved.
      insert into public.bank_accounts (employee_id, bank_code, account_no, holder_name, is_primary, status)
      values (v_employee.id, p_value ->> 'bank_code', p_value ->> 'account_no',
              btrim(p_value ->> 'holder_name'), false, 'pending')
      returning id into v_bank_account_id;
      select jsonb_build_object('bank_code', a.bank_code, 'account_last4', a.account_no_last4,
                                'holder_name', a.holder_name)
      into v_new from public.bank_accounts a where a.id = v_bank_account_id;
      v_old := case when v_current.id is null then null else jsonb_build_object(
        'bank_code', v_current.bank_code, 'account_last4', v_current.account_no_last4,
        'holder_name', v_current.holder_name) end;
    else
      raise exception 'This detail cannot be changed by request' using errcode = '22023';
  end case;

  insert into public.profile_change_requests
    (tenant_id, employee_id, field, old_value, new_value, note, bank_account_id)
  values (v_employee.tenant_id, v_employee.id, p_field, v_old, v_new,
          nullif(btrim(p_note), ''), v_bank_account_id)
  returning id into v_request_id;

  v_approval_id := public.create_approval(
    case when p_field = 'bank_account' then 'bank_change' else 'profile_change' end,
    v_request_id,
    public.profile_change_reviewer(v_employee.tenant_id)
  );
  update public.profile_change_requests set approval_id = v_approval_id where id = v_request_id;

  return v_request_id;
end;
$$;

revoke execute on function public.request_profile_change(text, jsonb, text) from public, anon;
grant execute on function public.request_profile_change(text, jsonb, text) to authenticated;

-- The employee withdraws their own pending request.
create or replace function public.cancel_profile_change(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.profile_change_requests;
begin
  select * into v_request from public.profile_change_requests
  where id = p_request_id
    and employee_id = public.auth_employee_id()
    and tenant_id = public.auth_tenant_id()
  for update;
  if not found then
    raise exception 'Request not found' using errcode = 'P0002';
  end if;
  if v_request.status <> 'pending' then
    raise exception 'This request is already %', v_request.status using errcode = '22023';
  end if;
  -- The approvals trigger below marks the request cancelled.
  update public.approvals set status = 'cancelled', decided_at = now()
  where id = v_request.approval_id and status = 'pending';
end;
$$;

revoke execute on function public.cancel_profile_change(uuid) from public, anon;
grant execute on function public.cancel_profile_change(uuid) to authenticated;

-- Applies or closes the request when its approval is decided.
create or replace function public.profile_change_on_decision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.profile_change_requests;
begin
  select * into v_request from public.profile_change_requests
  where id = new.entity_id and approval_id = new.id
  for update;
  if not found or v_request.status <> 'pending' then
    return null;
  end if;

  if new.status = 'approved' then
    case v_request.field
      when 'phone' then
        update public.employees set phone = v_request.new_value ->> 'value' where id = v_request.employee_id;
      when 'email' then
        update public.employees set email = v_request.new_value ->> 'value' where id = v_request.employee_id;
      when 'address' then
        update public.employees set address = v_request.new_value ->> 'value' where id = v_request.employee_id;
      when 'emergency_contact' then
        update public.employees set emergency_contact = v_request.new_value where id = v_request.employee_id;
      when 'bank_account' then
        update public.bank_accounts set status = 'active', is_primary = true
        where id = v_request.bank_account_id;
    end case;
  elsif v_request.field = 'bank_account' then
    update public.bank_accounts set status = 'rejected' where id = v_request.bank_account_id;
  end if;

  update public.profile_change_requests
  set status = new.status, decided_at = coalesce(new.decided_at, now())
  where id = v_request.id;
  return null;
end;
$$;

create trigger approvals_profile_change_decided
  after update of status on public.approvals
  for each row
  when (
    new.entity_type in ('profile_change', 'bank_change')
    and old.status = 'pending'
    and new.status <> 'pending'
  )
  execute function public.profile_change_on_decision();
