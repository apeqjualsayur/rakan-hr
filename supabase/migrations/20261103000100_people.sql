-- Step 5 (EMP-01 → EMP-06, EMP-08, EMP-09): people tables from data-model.md §3.2, the
-- global `banks` list (§3.1), job_roles (§3.3, created now so employees can be seeded
-- across the roles in company-config.yaml; Step 6 adds credential requirements), the
-- v_directory view (§3.4b) and the private `documents` and `avatars` buckets (§6).
--
-- Encryption at rest (CLAUDE.md, PRD §7): IC / passport numbers and employee bank account
-- numbers are encrypted with pgcrypto using a key held in Supabase Vault (pgsodium is
-- deprecated on Supabase). Apps write the plain number into a write-only column
-- (`employees.id_no`, `bank_accounts.account_no`); a BEFORE trigger encrypts it, keeps the
-- last 4 digits for masked display, and clears the plain column, so the plain number is
-- never stored, never audited and never readable through the API.

create extension if not exists pgcrypto with schema extensions;

-- ── Encryption key and helpers ──────────────────────────────────────────────────────────
-- The key is created once per project. Losing it makes every stored IC and account number
-- unreadable, so it must never be deleted or rotated without re-encrypting.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'pii_encryption_key') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'base64'),
      'pii_encryption_key',
      'Rakan: encrypts IC / passport and bank account numbers. Never delete or rotate without re-encrypting.'
    );
  end if;
end;
$$;

create or replace function public.pii_key()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_key text;
begin
  select decrypted_secret into v_key
  from vault.decrypted_secrets where name = 'pii_encryption_key';
  if v_key is null then
    raise exception 'Encryption key pii_encryption_key is missing from Vault';
  end if;
  return v_key;
end;
$$;

create or replace function public.pii_encrypt(p_value text)
returns bytea
language sql
volatile
security definer
set search_path = ''
as $$
  select extensions.pgp_sym_encrypt(p_value, public.pii_key());
$$;

create or replace function public.pii_decrypt(p_value bytea)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select extensions.pgp_sym_decrypt(p_value, public.pii_key());
$$;

-- Keyed hash: lets the database spot a duplicate IC without being able to read it.
create or replace function public.pii_hash(p_value text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select encode(extensions.hmac(p_value, public.pii_key(), 'sha256'), 'hex');
$$;

revoke execute on function public.pii_key() from public, anon, authenticated;
revoke execute on function public.pii_encrypt(text) from public, anon, authenticated;
revoke execute on function public.pii_decrypt(bytea) from public, anon, authenticated;
revoke execute on function public.pii_hash(text) from public, anon, authenticated;

-- Revealing a full number is logged in the audit trail (PDPA: who saw what, when).
alter table public.audit_log drop constraint audit_log_action_check;
alter table public.audit_log
  add constraint audit_log_action_check check (action in ('INSERT', 'UPDATE', 'DELETE', 'REVEAL'));

-- ── Enums not listed in data-model.md §4 ────────────────────────────────────────────────
create type public.gender as enum ('male', 'female');
create type public.marital_status as enum ('single', 'married', 'divorced', 'widowed');

-- ── §3.1 banks (global reference) ───────────────────────────────────────────────────────
-- SWIFT / IBG codes are filled in with the payment-file adapters (PAY-10), not guessed now.
create table public.banks (
  code text primary key,
  name text not null,
  swift_bic text,
  ibg_code text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger banks_set_updated_at before update on public.banks
  for each row execute function public.set_updated_at();

insert into public.banks (code, name) values
  ('MBB', 'Maybank'),
  ('CIMB', 'CIMB Bank'),
  ('PBB', 'Public Bank'),
  ('RHB', 'RHB Bank'),
  ('HLB', 'Hong Leong Bank'),
  ('AMB', 'AmBank'),
  ('BIMB', 'Bank Islam'),
  ('AFFIN', 'Affin Bank'),
  ('ABMB', 'Alliance Bank'),
  ('BKRM', 'Bank Rakyat'),
  ('BSN', 'Bank Simpanan Nasional (BSN)'),
  ('BMMB', 'Bank Muamalat'),
  ('AGRO', 'Agrobank'),
  ('MBSB', 'MBSB Bank'),
  ('OCBC', 'OCBC Bank'),
  ('UOB', 'UOB'),
  ('HSBC', 'HSBC'),
  ('SCB', 'Standard Chartered'),
  ('ARB', 'Al Rajhi Bank'),
  ('KFH', 'Kuwait Finance House')
on conflict (code) do nothing;

-- ── §3.3 job_roles ──────────────────────────────────────────────────────────────────────
-- Role category (EMP-03 clinical / non-clinical) comes from is_clinical.
create table public.job_roles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null check (btrim(name) <> ''),
  is_clinical boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  constraint job_roles_tenant_name_key unique (tenant_id, name)
);
create trigger job_roles_set_updated_at before update on public.job_roles
  for each row execute function public.set_updated_at();

-- ── §3.2 employees 🔒 ───────────────────────────────────────────────────────────────────
create table public.employees (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  employee_no text not null,
  full_name text not null check (btrim(full_name) <> ''),
  id_type public.id_type not null default 'mykad',
  -- Write-only: the trigger encrypts it into id_no_encrypted and clears it. '' removes the number.
  id_no text,
  id_no_encrypted bytea,
  id_no_hash text,
  id_no_last4 text,
  nationality text not null default 'MY',
  is_permanent_resident boolean not null default false,
  date_of_birth date,
  gender public.gender,
  marital_status public.marital_status,
  religion text check (religion in ('islam', 'buddhism', 'christianity', 'hinduism', 'sikhism', 'other')),
  pcb_category public.pcb_category,
  spouse_working boolean,
  children_count_eligible integer not null default 0 check (children_count_eligible between 0 and 99),
  email text,
  phone text,
  address text,
  work_email text,
  work_phone text,
  emergency_contact jsonb not null default '{}'::jsonb,
  epf_no text,
  socso_no text,
  tax_no text,
  eis_eligible boolean, -- null = automatic (Malaysian or PR aged 18–59)
  zakat_monthly numeric(12, 2) check (zakat_monthly >= 0),
  status public.employee_status not null default 'active',
  branch_id uuid references public.branches (id) on delete set null,
  manager_id uuid references public.employees (id) on delete set null,
  job_role_id uuid references public.job_roles (id) on delete set null,
  job_title text,
  photo_path text,
  user_id uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  constraint employees_tenant_no_key unique (tenant_id, employee_no),
  constraint employees_id_no_write_only check (id_no is null),
  constraint employees_not_own_manager check (manager_id <> id),
  constraint employees_emergency_contact_object check (jsonb_typeof(emergency_contact) = 'object')
);
create index employees_tenant_id_idx on public.employees (tenant_id);
create index employees_manager_id_idx on public.employees (manager_id);
create unique index employees_tenant_id_no_key
  on public.employees (tenant_id, id_type, id_no_hash)
  where id_no_hash is not null and deleted_at is null;

-- Normalises and encrypts the identity number, numbers new employees (E0001 …), and keeps
-- branch, manager and job role inside the employee's own company with no reporting loops.
create or replace function public.employees_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_number text;
  v_loop boolean;
begin
  if new.id_no is not null then
    v_number := upper(regexp_replace(new.id_no, '[\s-]', '', 'g'));
    if v_number = '' then
      new.id_no_encrypted := null;
      new.id_no_hash := null;
      new.id_no_last4 := null;
    else
      if new.id_type = 'mykad' and v_number !~ '^[0-9]{12}$' then
        raise exception 'A MyKad number has 12 digits' using errcode = '22023';
      end if;
      if new.id_type = 'passport' and v_number !~ '^[A-Z0-9]{5,20}$' then
        raise exception 'A passport number has 5 to 20 letters or digits' using errcode = '22023';
      end if;
      new.id_no_encrypted := public.pii_encrypt(v_number);
      new.id_no_hash := public.pii_hash(new.id_type || ':' || v_number);
      new.id_no_last4 := right(v_number, 4);
    end if;
    new.id_no := null;
  elsif tg_op = 'UPDATE' and new.id_type is distinct from old.id_type
        and new.id_no_encrypted is not null then
    new.id_no_hash := public.pii_hash(new.id_type || ':' || public.pii_decrypt(new.id_no_encrypted));
  end if;

  if new.employee_no is null or btrim(new.employee_no) = '' then
    perform pg_advisory_xact_lock(hashtext('employee_no:' || new.tenant_id::text));
    select 'E' || lpad((coalesce(max(substring(e.employee_no from '^E([0-9]+)$')::int), 0) + 1)::text, 4, '0')
    into new.employee_no
    from public.employees e
    where e.tenant_id = new.tenant_id;
  else
    new.employee_no := btrim(new.employee_no);
  end if;

  if new.branch_id is not null and not exists (
    select 1 from public.branches b where b.id = new.branch_id and b.tenant_id = new.tenant_id
  ) then
    raise exception 'Branch belongs to another company' using errcode = '23503';
  end if;
  if new.job_role_id is not null and not exists (
    select 1 from public.job_roles r where r.id = new.job_role_id and r.tenant_id = new.tenant_id
  ) then
    raise exception 'Job role belongs to another company' using errcode = '23503';
  end if;
  if new.manager_id is not null then
    if not exists (
      select 1 from public.employees m where m.id = new.manager_id and m.tenant_id = new.tenant_id
    ) then
      raise exception 'Manager belongs to another company' using errcode = '23503';
    end if;
    -- Walk up from the new manager; reaching this employee means a reporting loop.
    with recursive chain (id, manager_id, depth) as (
      select e.id, e.manager_id, 1 from public.employees e where e.id = new.manager_id
      union all
      select e.id, e.manager_id, c.depth + 1
      from public.employees e join chain c on e.id = c.manager_id
      where c.depth < 100
    )
    select exists (select 1 from chain where id = new.id) into v_loop;
    if v_loop then
      raise exception 'This would make a reporting loop' using errcode = '23514',
        hint = 'manager_cycle';
    end if;
  end if;

  return new;
end;
$$;

create trigger employees_before_write
  before insert or update on public.employees
  for each row execute function public.employees_before_write();
create trigger employees_set_updated_at before update on public.employees
  for each row execute function public.set_updated_at();

-- Child tables take tenant_id from their employee, so it can never point elsewhere.
create or replace function public.set_tenant_from_employee()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select e.tenant_id into new.tenant_id from public.employees e where e.id = new.employee_id;
  if new.tenant_id is null then
    raise exception 'Employee not found' using errcode = '23503';
  end if;
  return new;
end;
$$;

-- ── §3.2 employment_records 🔒 (contract history) ───────────────────────────────────────
create table public.employment_records (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  employment_type public.employment_type not null,
  pay_model public.pay_model not null,
  basic_salary numeric(12, 2) check (basic_salary >= 0),
  hourly_rate numeric(12, 2) check (hourly_rate >= 0),
  session_rate numeric(12, 2) check (session_rate >= 0),
  normal_hours_per_day numeric(4, 2) check (normal_hours_per_day > 0 and normal_hours_per_day <= 24),
  work_days_per_week numeric(3, 1) check (work_days_per_week > 0 and work_days_per_week <= 7),
  start_date date not null,
  end_date date,
  probation_end date,
  confirmed_on date,
  is_current boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  constraint employment_records_end_after_start check (end_date >= start_date),
  constraint employment_records_probation_after_start check (probation_end >= start_date),
  constraint employment_records_rate_for_pay_model check (
    case pay_model
      when 'monthly' then basic_salary is not null
      when 'hourly' then hourly_rate is not null
      when 'per_session' then session_rate is not null
    end
  )
);
create index employment_records_employee_idx on public.employment_records (employee_id, start_date desc);
create unique index employment_records_one_current
  on public.employment_records (employee_id) where is_current;

-- A new current record ends the previous one (contract history stays).
create or replace function public.employment_records_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_current and (tg_op = 'INSERT' or not old.is_current) then
    update public.employment_records r
    set is_current = false,
        end_date = coalesce(r.end_date, greatest(r.start_date, new.start_date - 1))
    where r.employee_id = new.employee_id and r.is_current and r.id <> new.id;
  end if;
  return new;
end;
$$;

create trigger employment_records_set_tenant
  before insert or update of employee_id on public.employment_records
  for each row execute function public.set_tenant_from_employee();
create trigger employment_records_before_write
  before insert or update on public.employment_records
  for each row execute function public.employment_records_before_write();
create trigger employment_records_set_updated_at before update on public.employment_records
  for each row execute function public.set_updated_at();

-- ── §3.2 dependents (PCB child relief inputs) ───────────────────────────────────────────
create table public.dependents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  name text not null check (btrim(name) <> ''),
  relationship text not null check (relationship in ('spouse', 'child')),
  date_of_birth date,
  is_disabled boolean not null default false,
  in_tertiary_education boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create index dependents_employee_idx on public.dependents (employee_id);
create trigger dependents_set_tenant
  before insert or update of employee_id on public.dependents
  for each row execute function public.set_tenant_from_employee();
create trigger dependents_set_updated_at before update on public.dependents
  for each row execute function public.set_updated_at();

-- ── §3.2 bank_accounts 🔒 ───────────────────────────────────────────────────────────────
-- status: pending = asked for by the employee, waiting for HR (EMP-07); active = in use;
-- retired = replaced by a newer account; rejected = HR turned the change down.
-- Payroll pays the one primary account.
create table public.bank_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  bank_code text not null references public.banks (code),
  account_no text, -- write-only, like employees.id_no
  account_no_encrypted bytea not null,
  account_no_last4 text not null,
  holder_name text not null check (btrim(holder_name) <> ''),
  is_primary boolean not null default false,
  status text not null default 'active' check (status in ('pending', 'active', 'retired', 'rejected')),
  verified_by uuid references auth.users (id) on delete set null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  constraint bank_accounts_account_no_write_only check (account_no is null),
  constraint bank_accounts_primary_is_active check (not is_primary or status = 'active')
);
create index bank_accounts_employee_idx on public.bank_accounts (employee_id);
create unique index bank_accounts_one_primary
  on public.bank_accounts (employee_id) where is_primary;

create or replace function public.bank_accounts_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_number text;
begin
  if new.account_no is not null then
    v_number := regexp_replace(new.account_no, '[\s-]', '', 'g');
    if v_number !~ '^[0-9]{6,20}$' then
      raise exception 'A bank account number has 6 to 20 digits' using errcode = '22023';
    end if;
    new.account_no_encrypted := public.pii_encrypt(v_number);
    new.account_no_last4 := right(v_number, 4);
    new.account_no := null;
  elsif tg_op = 'UPDATE' and new.account_no_encrypted is distinct from old.account_no_encrypted then
    raise exception 'Change the account number through account_no' using errcode = '42501';
  end if;

  -- Whoever makes an account active (HR entering it, or approving a change) verified it.
  if new.status = 'active' and (tg_op = 'INSERT' or old.status <> 'active') then
    new.verified_by := auth.uid();
    new.verified_at := now();
  end if;

  -- Becoming primary retires the account it replaces.
  if new.is_primary and (tg_op = 'INSERT' or not old.is_primary) then
    update public.bank_accounts a
    set is_primary = false, status = 'retired'
    where a.employee_id = new.employee_id and a.is_primary and a.id <> new.id;
  end if;
  return new;
end;
$$;

create trigger bank_accounts_set_tenant
  before insert or update of employee_id on public.bank_accounts
  for each row execute function public.set_tenant_from_employee();
create trigger bank_accounts_before_write
  before insert or update on public.bank_accounts
  for each row execute function public.bank_accounts_before_write();
create trigger bank_accounts_set_updated_at before update on public.bank_accounts
  for each row execute function public.set_updated_at();

-- ── §3.2 documents (EMP-06) ─────────────────────────────────────────────────────────────
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  doc_type text not null check (doc_type in (
    'ic_copy', 'passport', 'work_permit', 'contract', 'offer_letter', 'certificate', 'other'
  )),
  title text,
  file_path text not null,
  mime text,
  size_bytes integer,
  expiry_date date,
  uploaded_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create index documents_employee_idx on public.documents (employee_id);
create trigger documents_set_tenant
  before insert or update of employee_id on public.documents
  for each row execute function public.set_tenant_from_employee();
create trigger documents_set_updated_at before update on public.documents
  for each row execute function public.set_updated_at();

-- ── memberships ↔ employees ─────────────────────────────────────────────────────────────
-- A Rakan account is linked to an employee record when the invite email matches the
-- employee's work or personal email. Linking works whichever is created first.
alter table public.memberships
  add constraint memberships_employee_id_fkey
  foreign key (employee_id) references public.employees (id) on delete set null;

create or replace function public.link_employee_accounts(p_tenant_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.memberships m
  set employee_id = e.id
  from public.employees e
  where m.tenant_id = p_tenant_id
    and e.tenant_id = p_tenant_id
    and m.employee_id is null
    and m.invited_email is not null
    and e.deleted_at is null
    and m.invited_email in (lower(e.work_email), lower(e.email))
    and not exists (select 1 from public.memberships m2 where m2.employee_id = e.id);

  update public.employees e
  set user_id = m.user_id
  from public.memberships m
  where m.tenant_id = p_tenant_id
    and m.employee_id = e.id
    and m.user_id is not null
    and e.user_id is distinct from m.user_id;
$$;

revoke execute on function public.link_employee_accounts(uuid) from public, anon, authenticated;

create or replace function public.link_employee_accounts_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.link_employee_accounts(new.tenant_id);
  return null;
end;
$$;

create trigger employees_link_accounts
  after insert or update of email, work_email on public.employees
  for each row execute function public.link_employee_accounts_trigger();
create trigger memberships_link_employee
  after insert or update of invited_email, user_id, employee_id on public.memberships
  for each row execute function public.link_employee_accounts_trigger();

-- ── Audit (🔒 tables) ───────────────────────────────────────────────────────────────────
select audit.enable('public.employees');
select audit.enable('public.employment_records');
select audit.enable('public.bank_accounts');

-- ── RLS (data-model.md §5) ──────────────────────────────────────────────────────────────
-- People records: owner and HR admin manage; payroll approver and auditor read (payroll
-- review and inspections); staff and managers read only their own record. Managers see
-- colleagues through v_directory. Bank accounts: owner, HR admin and the employee only.
alter table public.banks enable row level security;
alter table public.job_roles enable row level security;
alter table public.employees enable row level security;
alter table public.employment_records enable row level security;
alter table public.dependents enable row level security;
alter table public.bank_accounts enable row level security;
alter table public.documents enable row level security;

revoke all on public.banks, public.job_roles, public.employees, public.employment_records,
  public.dependents, public.bank_accounts, public.documents from anon;

create policy banks_select on public.banks for select to authenticated using (true);
revoke insert, update, delete on public.banks from authenticated;

create policy job_roles_select on public.job_roles for select to authenticated
  using (tenant_id = public.auth_tenant_id());
create policy job_roles_insert on public.job_roles for insert to authenticated
  with check (tenant_id = public.auth_tenant_id() and public.auth_role() in ('owner', 'hr_admin'));
create policy job_roles_update on public.job_roles for update to authenticated
  using (tenant_id = public.auth_tenant_id() and public.auth_role() in ('owner', 'hr_admin'))
  with check (tenant_id = public.auth_tenant_id());

-- employees, employment_records, dependents: same shape.
create policy employees_select on public.employees for select to authenticated
  using (
    tenant_id = public.auth_tenant_id()
    and (
      public.auth_role() in ('owner', 'hr_admin', 'payroll_approver', 'auditor')
      or id = public.auth_employee_id()
    )
  );
create policy employees_insert on public.employees for insert to authenticated
  with check (tenant_id = public.auth_tenant_id() and public.auth_role() in ('owner', 'hr_admin'));
create policy employees_update on public.employees for update to authenticated
  using (tenant_id = public.auth_tenant_id() and public.auth_role() in ('owner', 'hr_admin'))
  with check (tenant_id = public.auth_tenant_id());

create policy employment_records_select on public.employment_records for select to authenticated
  using (
    tenant_id = public.auth_tenant_id()
    and (
      public.auth_role() in ('owner', 'hr_admin', 'payroll_approver', 'auditor')
      or employee_id = public.auth_employee_id()
    )
  );
create policy employment_records_insert on public.employment_records for insert to authenticated
  with check (tenant_id = public.auth_tenant_id() and public.auth_role() in ('owner', 'hr_admin'));
create policy employment_records_update on public.employment_records for update to authenticated
  using (tenant_id = public.auth_tenant_id() and public.auth_role() in ('owner', 'hr_admin'))
  with check (tenant_id = public.auth_tenant_id());

create policy dependents_select on public.dependents for select to authenticated
  using (
    tenant_id = public.auth_tenant_id()
    and (
      public.auth_role() in ('owner', 'hr_admin', 'payroll_approver', 'auditor')
      or employee_id = public.auth_employee_id()
    )
  );
create policy dependents_insert on public.dependents for insert to authenticated
  with check (tenant_id = public.auth_tenant_id() and public.auth_role() in ('owner', 'hr_admin'));
create policy dependents_update on public.dependents for update to authenticated
  using (tenant_id = public.auth_tenant_id() and public.auth_role() in ('owner', 'hr_admin'))
  with check (tenant_id = public.auth_tenant_id());
create policy dependents_delete on public.dependents for delete to authenticated
  using (tenant_id = public.auth_tenant_id() and public.auth_role() in ('owner', 'hr_admin'));

create policy bank_accounts_select on public.bank_accounts for select to authenticated
  using (
    tenant_id = public.auth_tenant_id()
    and (
      public.auth_role() in ('owner', 'hr_admin')
      or employee_id = public.auth_employee_id()
    )
  );
create policy bank_accounts_insert on public.bank_accounts for insert to authenticated
  with check (tenant_id = public.auth_tenant_id() and public.auth_role() in ('owner', 'hr_admin'));
create policy bank_accounts_update on public.bank_accounts for update to authenticated
  using (tenant_id = public.auth_tenant_id() and public.auth_role() in ('owner', 'hr_admin'))
  with check (tenant_id = public.auth_tenant_id());

create policy documents_select on public.documents for select to authenticated
  using (
    tenant_id = public.auth_tenant_id()
    and (
      public.auth_role() in ('owner', 'hr_admin')
      or employee_id = public.auth_employee_id()
    )
  );
create policy documents_insert on public.documents for insert to authenticated
  with check (tenant_id = public.auth_tenant_id() and public.auth_role() in ('owner', 'hr_admin'));
create policy documents_update on public.documents for update to authenticated
  using (tenant_id = public.auth_tenant_id() and public.auth_role() in ('owner', 'hr_admin'))
  with check (tenant_id = public.auth_tenant_id());
create policy documents_delete on public.documents for delete to authenticated
  using (tenant_id = public.auth_tenant_id() and public.auth_role() in ('owner', 'hr_admin'));

-- Employees are never deleted (6-year retention): they are marked as left.
revoke delete, truncate on public.employees, public.employment_records, public.bank_accounts
  from authenticated;

-- Column privileges: the ciphertext and keyed hash are never readable through the API,
-- and only the write-only plain columns (id_no, account_no) can carry a new number.
revoke select, insert, update on public.employees from authenticated;
grant select (
  id, tenant_id, employee_no, full_name, id_type, id_no, id_no_last4, nationality,
  is_permanent_resident, date_of_birth, gender, marital_status, religion, pcb_category,
  spouse_working, children_count_eligible, email, phone, address, work_email, work_phone,
  emergency_contact, epf_no, socso_no, tax_no, eis_eligible, zakat_monthly, status,
  branch_id, manager_id, job_role_id, job_title, photo_path, user_id, deleted_at,
  created_at, updated_at, created_by
) on public.employees to authenticated;
grant insert (
  tenant_id, employee_no, full_name, id_type, id_no, nationality, is_permanent_resident,
  date_of_birth, gender, marital_status, religion, pcb_category, spouse_working,
  children_count_eligible, email, phone, address, work_email, work_phone, emergency_contact,
  epf_no, socso_no, tax_no, eis_eligible, zakat_monthly, status, branch_id, manager_id,
  job_role_id, job_title, photo_path
) on public.employees to authenticated;
grant update (
  full_name, id_type, id_no, nationality, is_permanent_resident, date_of_birth, gender,
  marital_status, religion, pcb_category, spouse_working, children_count_eligible, email,
  phone, address, work_email, work_phone, emergency_contact, epf_no, socso_no, tax_no,
  eis_eligible, zakat_monthly, status, branch_id, manager_id, job_role_id, job_title,
  photo_path, deleted_at
) on public.employees to authenticated;

revoke select, insert, update on public.bank_accounts from authenticated;
grant select (
  id, tenant_id, employee_id, bank_code, account_no_last4, holder_name, is_primary, status,
  verified_by, verified_at, created_at, updated_at, created_by
) on public.bank_accounts to authenticated;
grant insert (employee_id, bank_code, account_no, holder_name, is_primary, status)
  on public.bank_accounts to authenticated;
grant update (is_primary, status) on public.bank_accounts to authenticated;

-- ── Reveal a full number (owner / HR admin only; logged) ────────────────────────────────
create or replace function public.reveal_employee_id_no(p_employee_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_employee public.employees;
begin
  if public.auth_role() is null or public.auth_role() not in ('owner', 'hr_admin') then
    raise exception 'Only the owner or HR admin can see full IC numbers' using errcode = '42501';
  end if;
  select * into v_employee from public.employees
  where id = p_employee_id and tenant_id = public.auth_tenant_id();
  if not found or v_employee.id_no_encrypted is null then
    return null;
  end if;
  insert into public.audit_log (tenant_id, table_name, row_id, action, new_data, actor_id)
  values (v_employee.tenant_id, 'public.employees', v_employee.id, 'REVEAL',
          jsonb_build_object('field', 'id_no'), auth.uid());
  return public.pii_decrypt(v_employee.id_no_encrypted);
end;
$$;

create or replace function public.reveal_bank_account_no(p_bank_account_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_account public.bank_accounts;
begin
  if public.auth_role() is null or public.auth_role() not in ('owner', 'hr_admin') then
    raise exception 'Only the owner or HR admin can see full account numbers' using errcode = '42501';
  end if;
  select * into v_account from public.bank_accounts
  where id = p_bank_account_id and tenant_id = public.auth_tenant_id();
  if not found then
    return null;
  end if;
  insert into public.audit_log (tenant_id, table_name, row_id, action, new_data, actor_id)
  values (v_account.tenant_id, 'public.bank_accounts', v_account.id, 'REVEAL',
          jsonb_build_object('field', 'account_no'), auth.uid());
  return public.pii_decrypt(v_account.account_no_encrypted);
end;
$$;

revoke execute on function public.reveal_employee_id_no(uuid) from public, anon;
revoke execute on function public.reveal_bank_account_no(uuid) from public, anon;
grant execute on function public.reveal_employee_id_no(uuid) to authenticated;
grant execute on function public.reveal_bank_account_no(uuid) to authenticated;

-- ── §3.4b v_directory (EMP-08 / EMP-09) ─────────────────────────────────────────────────
-- Every member of the company reads the directory: work contact details only, never
-- personal, statutory or bank data. Runs with the view owner's rights so staff can see
-- colleagues they cannot read in `employees`; the WHERE clause scopes it to the caller's
-- company. credential_status is filled in by Step 6 (credentials).
create view public.v_directory
with (security_invoker = false)
as
select
  e.id,
  e.tenant_id,
  e.full_name,
  e.job_title,
  r.name as job_role_name,
  r.is_clinical,
  e.branch_id,
  b.name as branch_name,
  e.work_email,
  e.work_phone,
  e.manager_id,
  e.photo_path,
  e.status,
  null::text as credential_status
from public.employees e
left join public.job_roles r on r.id = e.job_role_id
left join public.branches b on b.id = e.branch_id
where e.tenant_id = public.auth_tenant_id()
  and e.deleted_at is null
  and e.status in ('active', 'on_notice');

revoke all on public.v_directory from public, anon;
grant select on public.v_directory to authenticated;

-- ── Storage (data-model.md §6) ──────────────────────────────────────────────────────────
-- documents: {tenant_id}/{employee_id}/{doc_type}/{file}. Owner + HR; the employee reads own.
-- avatars:   {tenant_id}/{employee_id}.jpg. Every member reads; owner, HR and the employee write.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('documents', 'documents', false, 10485760,
   array['application/pdf', 'image/jpeg', 'image/png']),
  ('avatars', 'avatars', false, 10485760,
   array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy documents_files_select on storage.objects for select to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = public.auth_tenant_id()::text
    and (
      public.auth_role() in ('owner', 'hr_admin')
      or (storage.foldername(name))[2] = public.auth_employee_id()::text
    )
  );
create policy documents_files_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = public.auth_tenant_id()::text
    and public.auth_role() in ('owner', 'hr_admin')
  );
create policy documents_files_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = public.auth_tenant_id()::text
    and public.auth_role() in ('owner', 'hr_admin')
  );

create policy avatars_select on storage.objects for select to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = public.auth_tenant_id()::text
  );
create policy avatars_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = public.auth_tenant_id()::text
    and (
      public.auth_role() in ('owner', 'hr_admin')
      or storage.filename(name) like public.auth_employee_id()::text || '.%'
    )
  );
create policy avatars_update on storage.objects for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = public.auth_tenant_id()::text
    and (
      public.auth_role() in ('owner', 'hr_admin')
      or storage.filename(name) like public.auth_employee_id()::text || '.%'
    )
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = public.auth_tenant_id()::text
  );
create policy avatars_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = public.auth_tenant_id()::text
    and public.auth_role() in ('owner', 'hr_admin')
  );
