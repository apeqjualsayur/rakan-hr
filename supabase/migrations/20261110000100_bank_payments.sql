-- Step 12 (PAY-10, part 1): bank-agnostic payments setup. data-model.md §3.1 banks,
-- bank_file_formats, company_bank_accounts.
--
-- No bank is hard-wired: the company registers any number of payroll accounts at any
-- Malaysian bank, marks one as default and retires old ones (never deleted, history kept).
-- Each account names the bank_file_format its payment file is written in. GENERIC_CSV
-- (configurable columns) always exists; a bank-specific format is a new row here plus a
-- new adapter in supabase/functions/_shared/bank-files/ (see its README).

-- ── banks: SWIFT and IBG codes ──────────────────────────────────────────────────────────
-- Source: Bank Islam "Listing - Bank Code IBG" (bankislam.com/wp-content/uploads/
-- Bank-Code-IBG.pdf, read 5 Nov 2026). Malaysian IBG names the receiving bank by its
-- RENTAS BIC, which is the bank's SWIFT BIC, so both columns hold the same 8-character code.
-- ⚠ VERIFY against the chosen bank's own file spec when its adapter is built: some bulk
-- formats ask for a different bank code.
update public.banks b
set swift_bic = v.bic, ibg_code = v.bic
from (values
  ('MBB', 'MBBEMYKL'),
  ('CIMB', 'CIBBMYKL'),
  ('PBB', 'PBBEMYKL'),
  ('RHB', 'RHBBMYKL'),
  ('HLB', 'HLBBMYKL'),
  ('AMB', 'ARBKMYKL'),
  ('BIMB', 'BIMBMYKL'),
  ('AFFIN', 'PHBMMYKL'),
  ('ABMB', 'MFBBMYKL'),
  ('BKRM', 'BKRMMYKL'),
  ('BSN', 'BSNAMYK1'),
  ('BMMB', 'BMMBMYKL'),
  ('AGRO', 'AGOBMYKL'),
  ('MBSB', 'AFBQMYKL'),
  ('OCBC', 'OCBCMYKL'),
  ('UOB', 'UOVBMYKL'),
  ('HSBC', 'HBMBMYKL'),
  ('SCB', 'SCBLMYKX'),
  ('ARB', 'RJHIMYKL'),
  ('KFH', 'KFHOMYKL')
) as v (code, bic)
where b.code = v.code;

-- The other IBG participants on the same list.
insert into public.banks (code, name, swift_bic, ibg_code) values
  ('CITI', 'Citibank', 'CITIMYKL', 'CITIMYKL'),
  ('BOC', 'Bank of China (Malaysia)', 'BKCHMYKL', 'BKCHMYKL'),
  ('ICBC', 'ICBC (Malaysia)', 'ICBKMYKL', 'ICBKMYKL'),
  ('CCB', 'China Construction Bank (Malaysia)', 'PCBCMYKL', 'PCBCMYKL'),
  ('BKKB', 'Bangkok Bank', 'BKKBMYKL', 'BKKBMYKL'),
  ('BNP', 'BNP Paribas Malaysia', 'BNPAMYKL', 'BNPAMYKL'),
  ('BOFA', 'Bank of America (Malaysia)', 'BOFAMY2X', 'BOFAMY2X'),
  ('MUFG', 'MUFG Bank (Malaysia)', 'BOTKMYKX', 'BOTKMYKX'),
  ('JPM', 'J.P. Morgan Chase Bank', 'CHASMYKX', 'CHASMYKX'),
  ('DB', 'Deutsche Bank (Malaysia)', 'DEUTMYKL', 'DEUTMYKL'),
  ('MIZUHO', 'Mizuho Bank (Malaysia)', 'MHCBMYKA', 'MHCBMYKA'),
  ('SMBC', 'Sumitomo Mitsui Banking Corporation Malaysia', 'SMBCMYKL', 'SMBCMYKL')
on conflict (code) do nothing;

-- ── bank_file_formats (global reference) ────────────────────────────────────────────────
-- adapter_key names the adapter in supabase/functions/_shared/bank-files/adapters.ts.
-- column_mapping is used by the generic CSV adapter (shape: GenericCsvMapping in
-- _shared/bank-files/types.ts); bank-specific formats leave it null.
create table public.bank_file_formats (
  code text primary key check (code ~ '^[A-Z0-9_]+$'),
  name text not null,
  bank_code text references public.banks (code),
  version text not null default '1',
  adapter_key text not null,
  column_mapping jsonb check (column_mapping is null or jsonb_typeof(column_mapping) = 'object'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger bank_file_formats_set_updated_at before update on public.bank_file_formats
  for each row execute function public.set_updated_at();

-- Keep this mapping in step with DEFAULT_GENERIC_MAPPING in _shared/bank-files/generic-csv.ts.
insert into public.bank_file_formats (code, name, bank_code, version, adapter_key, column_mapping) values
  ('GENERIC_CSV', 'Generic CSV (DuitNow Bulk style)', null, '1', 'generic_csv',
   '{
      "delimiter": ",",
      "header": true,
      "dateFormat": "YYYY-MM-DD",
      "columns": [
        {"field": "beneficiary_name", "header": "Beneficiary Name"},
        {"field": "id_no", "header": "Beneficiary ID"},
        {"field": "bank_bic", "header": "Bank Code"},
        {"field": "bank_name", "header": "Bank Name"},
        {"field": "account_no", "header": "Account Number"},
        {"field": "amount", "header": "Amount"},
        {"field": "transfer_type", "header": "Transfer Type"},
        {"field": "reference", "header": "Payment Reference"},
        {"field": "description", "header": "Payment Description"},
        {"field": "email", "header": "Beneficiary Email"}
      ]
    }'::jsonb)
on conflict (code) do nothing;

alter table public.bank_file_formats enable row level security;
create policy bank_file_formats_select on public.bank_file_formats for select to authenticated
  using (true);
revoke insert, update, delete, truncate on public.bank_file_formats from authenticated, anon;

-- ── company_bank_accounts 🔒 ─────────────────────────────────────────────────────────────
-- account_no is write-only like bank_accounts.account_no: the trigger encrypts it and keeps
-- the last 4 digits. The number cannot change afterwards: a new number is a new account.
-- column_mapping: this company's own GENERIC_CSV columns (null = the format's default).
create table public.company_bank_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  bank_code text not null references public.banks (code),
  account_name text not null check (btrim(account_name) <> '' and length(account_name) <= 120),
  account_no text,
  account_no_encrypted bytea not null,
  account_no_last4 text not null,
  corporate_id text check (length(corporate_id) <= 40),
  org_code text check (length(org_code) <= 40),
  bank_file_format_code text not null default 'GENERIC_CSV' references public.bank_file_formats (code),
  column_mapping jsonb check (column_mapping is null or jsonb_typeof(column_mapping) = 'object'),
  is_default boolean not null default false,
  active_from date not null default ((now() at time zone 'Asia/Kuala_Lumpur')::date),
  retired_at timestamptz,
  retired_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  constraint company_bank_accounts_account_no_write_only check (account_no is null),
  constraint company_bank_accounts_default_not_retired check (not (is_default and retired_at is not null))
);
create index company_bank_accounts_tenant_idx on public.company_bank_accounts (tenant_id);
create unique index company_bank_accounts_one_default
  on public.company_bank_accounts (tenant_id) where is_default;
create trigger company_bank_accounts_set_updated_at before update on public.company_bank_accounts
  for each row execute function public.set_updated_at();

create or replace function public.company_bank_accounts_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_number text;
  v_format public.bank_file_formats;
begin
  if tg_op = 'UPDATE' and old.retired_at is not null then
    raise exception 'A retired account cannot be changed. Add a new account instead.'
      using errcode = '42501', hint = 'retired';
  end if;

  if new.account_no is not null then
    if tg_op = 'UPDATE' then
      raise exception 'The account number cannot change. Add a new account and retire this one.'
        using errcode = '42501', hint = 'number_fixed';
    end if;
    v_number := regexp_replace(new.account_no, '[\s-]', '', 'g');
    if v_number !~ '^[0-9]{6,20}$' then
      raise exception 'A bank account number has 6 to 20 digits' using errcode = '22023', hint = 'account_no';
    end if;
    new.account_no_encrypted := public.pii_encrypt(v_number);
    new.account_no_last4 := right(v_number, 4);
    new.account_no := null;
  elsif tg_op = 'UPDATE' and (new.account_no_encrypted is distinct from old.account_no_encrypted
      or new.account_no_last4 is distinct from old.account_no_last4
      or new.bank_code is distinct from old.bank_code
      or new.tenant_id is distinct from old.tenant_id) then
    raise exception 'The bank and account number cannot change. Add a new account and retire this one.'
      using errcode = '42501', hint = 'number_fixed';
  end if;

  -- The format must be active and fit the bank (generic formats fit every bank).
  select * into v_format from public.bank_file_formats where code = new.bank_file_format_code;
  if not found or not v_format.is_active
     or (v_format.bank_code is not null and v_format.bank_code <> new.bank_code) then
    raise exception 'This file format does not fit this bank' using errcode = '22023', hint = 'format';
  end if;

  -- Retiring: stamp it and give up the default.
  if new.retired_at is not null and (tg_op = 'INSERT' or old.retired_at is null) then
    new.retired_at := now();
    new.retired_by := auth.uid();
    new.is_default := false;
  end if;

  -- The first account becomes the default by itself.
  if tg_op = 'INSERT' and new.retired_at is null and not exists (
    select 1 from public.company_bank_accounts a
    where a.tenant_id = new.tenant_id and a.is_default
  ) then
    new.is_default := true;
  end if;

  -- Becoming the default takes it from the previous default.
  if new.is_default and (tg_op = 'INSERT' or not old.is_default) then
    update public.company_bank_accounts a
    set is_default = false
    where a.tenant_id = new.tenant_id and a.is_default and a.id <> new.id;
  end if;
  return new;
end;
$$;
create trigger company_bank_accounts_before_write
  before insert or update on public.company_bank_accounts
  for each row execute function public.company_bank_accounts_before_write();

-- PAY-10: read for HR, payroll and audit (numbers are masked: the encrypted column is never
-- granted); add, edit, set default and retire for the Owner only; never deleted.
alter table public.company_bank_accounts enable row level security;
create policy company_bank_accounts_select on public.company_bank_accounts for select to authenticated
  using (
    tenant_id = public.auth_tenant_id()
    and public.auth_role() in ('owner', 'hr_admin', 'payroll_approver', 'auditor')
  );
create policy company_bank_accounts_insert on public.company_bank_accounts for insert to authenticated
  with check (tenant_id = public.auth_tenant_id() and public.auth_role() = 'owner');
create policy company_bank_accounts_update on public.company_bank_accounts for update to authenticated
  using (tenant_id = public.auth_tenant_id() and public.auth_role() = 'owner')
  with check (tenant_id = public.auth_tenant_id() and public.auth_role() = 'owner');

revoke all on public.company_bank_accounts from anon;
revoke select, insert, update, delete, truncate on public.company_bank_accounts from authenticated;
grant select (
  id, tenant_id, bank_code, account_name, account_no_last4, corporate_id, org_code,
  bank_file_format_code, column_mapping, is_default, active_from, retired_at, retired_by,
  created_at, updated_at, created_by
) on public.company_bank_accounts to authenticated;
grant insert (
  tenant_id, bank_code, account_name, account_no, corporate_id, org_code,
  bank_file_format_code, column_mapping, is_default, active_from
) on public.company_bank_accounts to authenticated;
grant update (
  account_name, corporate_id, org_code, bank_file_format_code, column_mapping, is_default,
  retired_at
) on public.company_bank_accounts to authenticated;

select audit.enable('public.company_bank_accounts');

-- ORG-04: the checklist item is done once a default payroll account exists.
create or replace function public.company_bank_accounts_checklist()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_default then
    update public.setup_checklist_items i
    set status = 'done'
    where i.tenant_id = new.tenant_id and i.code = 'PAYROLL_BANK_ACCOUNT' and i.status <> 'done';
  end if;
  return null;
end;
$$;
create trigger company_bank_accounts_checklist
  after insert or update of is_default on public.company_bank_accounts
  for each row execute function public.company_bank_accounts_checklist();

-- For the payroll Edge Function (service role) when it writes the payment file: the full
-- account number of the paying account. Not callable from the app.
create or replace function public.company_bank_account_no(p_account_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select public.pii_decrypt(a.account_no_encrypted)
  from public.company_bank_accounts a where a.id = p_account_id;
$$;
revoke execute on function public.company_bank_account_no(uuid) from public, anon, authenticated;
