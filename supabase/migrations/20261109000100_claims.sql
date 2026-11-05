-- Step 11 (CLM-01): claim types with monthly and per-claim limits and eligible roles, the
-- mileage rate (company setting), claims with receipts (private `receipts` bucket),
-- manager approval, and approved claims → payroll_inputs (taxable or not, by type).

-- Rate per km for mileage claims. Not in company-config.yaml: blank until set in
-- Settings > Claims (mileage claims are refused until then).
alter table public.tenants
  add column mileage_rate_per_km numeric(6, 2) check (mileage_rate_per_km > 0);

-- ── claim_types ─────────────────────────────────────────────────────────────────────────
-- eligible_role_ids: empty = everyone. Limits null = no limit.
create table public.claim_types (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name_en text not null check (btrim(name_en) <> '' and char_length(name_en) <= 80),
  name_ms text not null check (btrim(name_ms) <> '' and char_length(name_ms) <= 80),
  monthly_limit numeric(12, 2) check (monthly_limit > 0),
  per_claim_limit numeric(12, 2) check (per_claim_limit > 0),
  is_taxable boolean not null default false,
  is_mileage boolean not null default false,
  requires_receipt boolean not null default true,
  eligible_role_ids uuid[] not null default '{}',
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  constraint claim_types_tenant_name_key unique (tenant_id, name_en)
);
create trigger claim_types_set_updated_at before update on public.claim_types
  for each row execute function public.set_updated_at();

-- ── claims 🔒 and receipts ──────────────────────────────────────────────────────────────
-- Never deleted (6-year retention); cancelled instead. payroll_run_id is set when paid.
create table public.claims (
  id uuid primary key,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  claim_type_id uuid not null references public.claim_types (id),
  expense_date date not null,
  amount numeric(12, 2) not null check (amount > 0),
  description text not null check (btrim(description) <> '' and char_length(description) <= 500),
  distance_km numeric(8, 1) check (distance_km > 0),
  rate_per_km numeric(6, 2),
  trip_from text check (char_length(trip_from) <= 120),
  trip_to text check (char_length(trip_to) <= 120),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  approval_id uuid references public.approvals (id) on delete set null,
  payroll_run_id uuid,
  decided_at timestamptz,
  decided_by uuid references auth.users (id) on delete set null,
  decision_comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create index claims_employee_idx on public.claims (employee_id, expense_date desc);
create index claims_tenant_status_idx on public.claims (tenant_id, status);
create trigger claims_a_set_tenant
  before insert or update of employee_id on public.claims
  for each row execute function public.set_tenant_from_employee();
create trigger claims_set_updated_at before update on public.claims
  for each row execute function public.set_updated_at();
select audit.enable('public.claims');

create table public.claim_receipts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  claim_id uuid not null references public.claims (id) on delete cascade,
  file_path text not null,
  created_at timestamptz not null default now(),
  constraint claim_receipts_path_key unique (file_path)
);
create index claim_receipts_claim_idx on public.claim_receipts (claim_id);

-- ── Rules ───────────────────────────────────────────────────────────────────────────────
-- What is already claimed (pending or approved) of a type in the month of a date.
create or replace function public.claimed_in_month(p_employee_id uuid, p_type_id uuid, p_date date, p_exclude uuid default null)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(c.amount), 0) from public.claims c
  where c.employee_id = p_employee_id and c.claim_type_id = p_type_id
    and c.status in ('pending', 'approved')
    and date_trunc('month', c.expense_date) = date_trunc('month', p_date)
    and c.id is distinct from p_exclude;
$$;
revoke execute on function public.claimed_in_month(uuid, uuid, date, uuid) from public, anon, authenticated;

-- The signed-in employee's claim types with what is left this month (for the form).
create or replace function public.my_claim_types(p_date date default public.malaysia_today())
returns table (id uuid, name_en text, name_ms text, monthly_limit numeric, per_claim_limit numeric,
  is_taxable boolean, is_mileage boolean, requires_receipt boolean, claimed numeric, mileage_rate numeric)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id, t.name_en, t.name_ms, t.monthly_limit, t.per_claim_limit, t.is_taxable, t.is_mileage,
         t.requires_receipt, public.claimed_in_month(e.id, t.id, p_date), tn.mileage_rate_per_km
  from public.employees e
  join public.claim_types t on t.tenant_id = e.tenant_id and t.is_active
  join public.tenants tn on tn.id = e.tenant_id
  where e.id = public.auth_employee_id()
    and (cardinality(t.eligible_role_ids) = 0 or e.job_role_id = any (t.eligible_role_ids))
  order by t.sort_order, t.name_en;
$$;
revoke execute on function public.my_claim_types(date) from public, anon;
grant execute on function public.my_claim_types(date) to authenticated;

-- CLM-01 submit. The browser has already uploaded the receipts to
-- receipts/{tenant}/{employee}/{claim id}/…; they are attached here. Checks: the type is
-- open to the person's role, a receipt where needed, the per-claim and monthly limits
-- (pending + approved this month), and for mileage the amount = km × the company rate.
-- The owner / HR admin can record a claim for anyone (approved straight away).
create or replace function public.submit_claim(
  p_claim_id uuid,
  p_claim_type_id uuid,
  p_expense_date date,
  p_amount numeric,
  p_description text,
  p_distance_km numeric default null,
  p_trip_from text default null,
  p_trip_to text default null,
  p_employee_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin boolean := public.auth_role() in ('owner', 'hr_admin');
  v_employee_id uuid := coalesce(p_employee_id, public.auth_employee_id());
  v_on_behalf boolean;
  v_employee public.employees;
  v_type public.claim_types;
  v_rate numeric;
  v_amount numeric := p_amount;
  v_claimed numeric;
  v_folder text;
  v_receipts integer;
begin
  if v_employee_id is null then
    raise exception 'Your account is not linked to an employee record' using errcode = '42501', hint = 'not_linked';
  end if;
  v_on_behalf := v_employee_id is distinct from public.auth_employee_id();
  if v_on_behalf and not v_admin then
    raise exception 'Only HR can claim for someone else' using errcode = '42501';
  end if;
  select * into v_employee from public.employees
  where id = v_employee_id and tenant_id = public.auth_tenant_id() and status in ('active', 'on_notice')
    and deleted_at is null;
  if not found then
    raise exception 'Employee not found' using errcode = 'P0002';
  end if;
  select * into v_type from public.claim_types
  where id = p_claim_type_id and tenant_id = v_employee.tenant_id and is_active;
  if not found or not (cardinality(v_type.eligible_role_ids) = 0 or v_employee.job_role_id = any (v_type.eligible_role_ids)) then
    raise exception 'This claim type is not open to you' using errcode = '22023', hint = 'not_eligible';
  end if;
  if p_expense_date > public.malaysia_today() then
    raise exception 'The expense date is in the future' using errcode = '22023', hint = 'future_date';
  end if;
  if btrim(coalesce(p_description, '')) = '' then
    raise exception 'Describe the expense' using errcode = '22023', hint = 'description_required';
  end if;

  if v_type.is_mileage then
    select mileage_rate_per_km into v_rate from public.tenants where id = v_employee.tenant_id;
    if v_rate is null then
      raise exception 'The mileage rate is not set yet' using errcode = '22023', hint = 'no_mileage_rate';
    end if;
    if p_distance_km is null or p_distance_km <= 0 then
      raise exception 'Enter the distance' using errcode = '22023', hint = 'distance_required';
    end if;
    v_amount := round(p_distance_km * v_rate, 2);
  end if;
  if v_amount is null or v_amount <= 0 then
    raise exception 'Enter the amount' using errcode = '22023', hint = 'amount_required';
  end if;

  if v_type.per_claim_limit is not null and v_amount > v_type.per_claim_limit then
    raise exception 'Above the per-claim limit of RM %', v_type.per_claim_limit using errcode = '22023',
      hint = 'per_claim_limit', detail = v_type.per_claim_limit::text;
  end if;
  v_claimed := public.claimed_in_month(v_employee_id, v_type.id, p_expense_date, p_claim_id);
  if v_type.monthly_limit is not null and v_claimed + v_amount > v_type.monthly_limit then
    raise exception 'Above the monthly limit: RM % left this month', greatest(v_type.monthly_limit - v_claimed, 0)
      using errcode = '22023', hint = 'monthly_limit',
      detail = greatest(v_type.monthly_limit - v_claimed, 0)::text;
  end if;

  v_folder := v_employee.tenant_id || '/' || v_employee_id || '/' || p_claim_id || '/';
  select count(*) into v_receipts from storage.objects o
  where o.bucket_id = 'receipts' and o.name like v_folder || '%';
  if v_type.requires_receipt and v_receipts = 0 then
    raise exception 'Attach a receipt' using errcode = '22023', hint = 'receipt_required';
  end if;

  insert into public.claims (id, employee_id, claim_type_id, expense_date, amount, description,
    distance_km, rate_per_km, trip_from, trip_to, status, decided_at, decided_by)
  values (p_claim_id, v_employee_id, v_type.id, p_expense_date, v_amount, btrim(p_description),
    case when v_type.is_mileage then p_distance_km end, case when v_type.is_mileage then v_rate end,
    nullif(btrim(p_trip_from), ''), nullif(btrim(p_trip_to), ''),
    case when v_on_behalf then 'approved' else 'pending' end,
    case when v_on_behalf then now() end, case when v_on_behalf then auth.uid() end);
  insert into public.claim_receipts (tenant_id, claim_id, file_path)
  select v_employee.tenant_id, p_claim_id, o.name from storage.objects o
  where o.bucket_id = 'receipts' and o.name like v_folder || '%';

  if v_on_behalf then
    perform public.claim_after_approval(p_claim_id);
  else
    update public.claims
    set approval_id = public.create_approval('claim', p_claim_id, public.leave_approval_steps(v_employee_id))
    where id = p_claim_id;
  end if;
  return p_claim_id;
exception
  when unique_violation then
    raise exception 'This claim was already sent' using errcode = '23505', hint = 'already_sent';
end;
$$;
revoke execute on function public.submit_claim(uuid, uuid, date, numeric, text, numeric, text, text, uuid) from public, anon;
grant execute on function public.submit_claim(uuid, uuid, date, numeric, text, numeric, text, text, uuid) to authenticated;

-- Approved: a payroll input for the month it was approved (Malaysia time), taxable or not
-- by type. (Whether an item is taxable for PCB is the accountant's call: ⚠ VERIFY per type.)
create or replace function public.claim_after_approval(p_claim_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claim public.claims;
  v_type public.claim_types;
begin
  select * into v_claim from public.claims where id = p_claim_id;
  select * into v_type from public.claim_types where id = v_claim.claim_type_id;
  insert into public.payroll_inputs (employee_id, period_month, pay_item_code, quantity, amount, source,
    source_id, description, created_by)
  values (v_claim.employee_id, date_trunc('month', public.malaysia_today())::date,
    case when v_type.is_taxable then 'CLAIM_TAXABLE' else 'CLAIM_NON_TAXABLE' end,
    coalesce(v_claim.distance_km, 1), v_claim.amount, 'claims', v_claim.id,
    v_type.name_en || ' ' || v_claim.expense_date || ': ' || left(v_claim.description, 120), null);
end;
$$;
revoke execute on function public.claim_after_approval(uuid) from public, anon, authenticated;

create or replace function public.claim_on_approval_decided()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claim public.claims;
  v_comment text;
begin
  select * into v_claim from public.claims
  where id = new.entity_id and approval_id = new.id and status = 'pending'
  for update;
  if not found then
    return null;
  end if;
  select s.comment into v_comment from public.approval_steps s
  where s.approval_id = new.id order by s.step_no desc limit 1;
  update public.claims
  set status = case new.status when 'approved' then 'approved' when 'rejected' then 'rejected' else 'cancelled' end,
      decided_at = now(), decided_by = auth.uid(), decision_comment = v_comment
  where id = v_claim.id;
  if new.status = 'approved' then
    perform public.claim_after_approval(v_claim.id);
  end if;
  return null;
end;
$$;
create trigger approvals_claim_decided
  after update of status on public.approvals
  for each row
  when (new.entity_type = 'claim' and old.status = 'pending' and new.status <> 'pending')
  execute function public.claim_on_approval_decided();

-- Staff cancel their own pending claim; the owner / HR admin also an approved one not yet
-- in a payroll run.
create or replace function public.cancel_claim(p_claim_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claim public.claims;
  v_admin boolean := public.auth_role() in ('owner', 'hr_admin');
begin
  select * into v_claim from public.claims
  where id = p_claim_id and tenant_id = public.auth_tenant_id()
  for update;
  if not found or not (v_claim.employee_id = public.auth_employee_id() or v_admin) then
    raise exception 'Claim not found' using errcode = 'P0002';
  end if;
  if v_claim.status = 'approved' and not v_admin then
    raise exception 'Ask HR to cancel an approved claim' using errcode = '42501', hint = 'ask_hr';
  end if;
  if v_claim.status not in ('pending', 'approved') then
    raise exception 'This claim is already closed' using errcode = '22023', hint = 'not_open';
  end if;
  if v_claim.payroll_run_id is not null or exists (
    select 1 from public.payroll_inputs p
    where p.source = 'claims' and p.source_id = v_claim.id and p.payroll_run_id is not null
  ) then
    raise exception 'This claim is already in a payroll run' using errcode = '22023', hint = 'in_payroll';
  end if;
  update public.claims set status = 'cancelled', decided_at = now(), decided_by = auth.uid()
  where id = v_claim.id;
  update public.approvals set status = 'cancelled', decided_at = now()
  where id = v_claim.approval_id and status = 'pending';
  delete from public.payroll_inputs where source = 'claims' and source_id = v_claim.id;
end;
$$;
revoke execute on function public.cancel_claim(uuid) from public, anon;
grant execute on function public.cancel_claim(uuid) to authenticated;

-- ── Seed: none by migration ─────────────────────────────────────────────────────────────
-- Claim types come from company-config.yaml claim_types (npm run db:seed).

-- ── RLS (data-model.md §5: claims — own read/insert, team read/approve, HR full, auditor read)
alter table public.claim_types enable row level security;
alter table public.claims enable row level security;
alter table public.claim_receipts enable row level security;
revoke all on public.claim_types, public.claims, public.claim_receipts from anon;

create policy claim_types_select on public.claim_types for select to authenticated
  using (tenant_id = public.auth_tenant_id());
create policy claim_types_insert on public.claim_types for insert to authenticated
  with check (tenant_id = public.auth_tenant_id() and public.auth_role() in ('owner', 'hr_admin'));
create policy claim_types_update on public.claim_types for update to authenticated
  using (tenant_id = public.auth_tenant_id() and public.auth_role() in ('owner', 'hr_admin'))
  with check (tenant_id = public.auth_tenant_id());
revoke delete on public.claim_types from authenticated;

create policy claims_select on public.claims for select to authenticated
  using (tenant_id = public.auth_tenant_id() and public.can_see_leave_of(employee_id));
revoke insert, update, delete, truncate on public.claims from authenticated;

create policy claim_receipts_select on public.claim_receipts for select to authenticated
  using (
    tenant_id = public.auth_tenant_id()
    and exists (select 1 from public.claims c where c.id = claim_id and public.can_see_leave_of(c.employee_id))
  );
revoke insert, update, delete, truncate on public.claim_receipts from authenticated;

-- ── Storage (data-model.md §6): receipts ────────────────────────────────────────────────
-- receipts: {tenant_id}/{employee_id}/{claim_id}/{file} · the employee uploads their own;
-- the employee, their approvers (manager) and owner / HR / payroll approver / auditor read.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy receipts_select on storage.objects for select to authenticated
  using (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = public.auth_tenant_id()::text
    and public.can_see_leave_of(((storage.foldername(name))[2])::uuid)
  );
create policy receipts_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = public.auth_tenant_id()::text
    and (
      (storage.foldername(name))[2] = public.auth_employee_id()::text
      or public.auth_role() in ('owner', 'hr_admin')
    )
    and not exists (select 1 from public.claims c where c.id::text = (storage.foldername(name))[3])
  );
