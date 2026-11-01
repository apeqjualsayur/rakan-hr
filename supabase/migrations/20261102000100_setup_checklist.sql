-- Step 4 (ORG-01 → ORG-04): company dates, branch geofence checks, the Employer Setup
-- Checklist (data-model.md §3.1 setup_checklist_items) and the private `company` bucket
-- that holds checklist evidence.

-- ORG-01 / ORG-04: the dates checklist deadlines count from. Prefilled from
-- company-config.yaml (first_hire_target_date / first_payday_target_date); Step 8 sets
-- first_hire_date when the first employee is converted.
alter table public.tenants
  add column first_hire_date date,
  add column first_payday_date date;

-- ORG-03: a geofence needs both coordinates, inside the valid ranges.
alter table public.branches
  add constraint branches_geo_lat_range check (geo_lat between -90 and 90),
  add constraint branches_geo_lng_range check (geo_lng between -180 and 180),
  add constraint branches_geo_pair check ((geo_lat is null) = (geo_lng is null));

-- ORG-04. `due_rule` counts days from a company date: 'first_hire+7', 'first_payday-7'.
-- Items with a rule get their due_date from it (kept in sync by triggers); items without a
-- rule take a due date typed in by the owner / HR admin.
create table public.setup_checklist_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  code text not null,
  title text not null,
  sort_order integer not null default 0,
  due_rule text check (due_rule ~ '^(first_hire|first_payday)[+-][0-9]+$'),
  due_date date,
  status public.checklist_status not null default 'not_started',
  evidence_file_path text,
  completed_at timestamptz,
  completed_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  constraint setup_checklist_items_tenant_code_key unique (tenant_id, code)
);

create trigger setup_checklist_items_set_updated_at before update on public.setup_checklist_items
  for each row execute function public.set_updated_at();

create or replace function public.checklist_due_date(
  p_rule text,
  p_first_hire date,
  p_first_payday date
)
returns date
language sql
immutable
set search_path = ''
as $$
  select case
    when p_rule like 'first_hire%' then p_first_hire + substring(p_rule from '[+-][0-9]+$')::int
    when p_rule like 'first_payday%' then p_first_payday + substring(p_rule from '[+-][0-9]+$')::int
  end;
$$;

-- Keeps due dates and completion fields consistent, whoever writes the row:
-- rule-based due dates are always recomputed; uploading evidence marks the item done;
-- completed_at / completed_by are set on the move to done and cleared on the move away.
create or replace function public.setup_checklist_items_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant public.tenants;
begin
  if new.due_rule is not null then
    select * into v_tenant from public.tenants where id = new.tenant_id;
    new.due_date := public.checklist_due_date(
      new.due_rule, v_tenant.first_hire_date, v_tenant.first_payday_date
    );
  end if;

  if tg_op = 'UPDATE'
     and new.evidence_file_path is not null
     and new.evidence_file_path is distinct from old.evidence_file_path
     and new.status = old.status then
    new.status := 'done';
  end if;

  if new.status <> 'done' then
    new.completed_at := null;
    new.completed_by := null;
  elsif tg_op = 'INSERT' or old.status <> 'done' then
    new.completed_at := now();
    new.completed_by := auth.uid();
  else
    new.completed_at := old.completed_at;
    new.completed_by := old.completed_by;
  end if;

  return new;
end;
$$;

create trigger setup_checklist_items_before_write
  before insert or update on public.setup_checklist_items
  for each row execute function public.setup_checklist_items_before_write();

-- Changing the first hire / payday date moves every rule-based deadline with it.
create or replace function public.tenants_refresh_checklist_due_dates()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.setup_checklist_items i
  set due_date = public.checklist_due_date(i.due_rule, new.first_hire_date, new.first_payday_date)
  where i.tenant_id = new.id and i.due_rule is not null;
  return null;
end;
$$;

create trigger tenants_refresh_checklist_due_dates
  after update of first_hire_date, first_payday_date on public.tenants
  for each row
  when (
    old.first_hire_date is distinct from new.first_hire_date
    or old.first_payday_date is distinct from new.first_payday_date
  )
  execute function public.tenants_refresh_checklist_due_dates();

-- The seven ORG-04 items. Deadlines marked ⚠ VERIFY in payroll-rules.md (EPF 7 days,
-- SOCSO 30 days) are shown in the app with "confirm with your accountant". The LHDN,
-- bank and PDPA deadlines are practical ones (needed before the first payday / before
-- collecting staff data), not statutory day counts. DPO and HRD Corp have no fixed rule.
-- Titles are stored in English; the app shows them in the viewer's language by `code`.
create or replace function public.seed_setup_checklist(p_tenant_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.setup_checklist_items (tenant_id, code, title, sort_order, due_rule, status)
  select
    t.id, v.code, v.title, v.sort_order, v.due_rule,
    -- HRD Corp is optional under 10 staff: not applicable until the company registers.
    case when v.code = 'HRDCORP_REGISTRATION' and t.hrdcorp_no is null
      then 'not_applicable'::public.checklist_status
      else 'not_started'::public.checklist_status
    end
  from public.tenants t
  cross join (values
    ('EPF_REGISTRATION', 'KWSP (EPF) employer registration', 10, 'first_hire+7'),
    ('SOCSO_REGISTRATION', 'PERKESO (SOCSO and EIS) employer registration', 20, 'first_hire+30'),
    ('LHDN_E_NUMBER', 'LHDN employer E-number', 30, 'first_payday+0'),
    ('PAYROLL_BANK_ACCOUNT', 'Company bank account for payroll', 40, 'first_payday-7'),
    ('PDPA_PRIVACY_NOTICE', 'PDPA privacy notice published', 50, 'first_hire+0'),
    ('DPO_APPOINTED', 'Data Protection Officer (DPO) appointed', 60, null),
    ('HRDCORP_REGISTRATION', 'HRD Corp employer registration', 70, null)
  ) as v (code, title, sort_order, due_rule)
  where t.id = p_tenant_id
  on conflict (tenant_id, code) do nothing;
$$;

revoke execute on function public.seed_setup_checklist(uuid) from public, anon, authenticated;

create or replace function public.tenants_seed_setup_checklist()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.seed_setup_checklist(new.id);
  return null;
end;
$$;

create trigger tenants_seed_setup_checklist
  after insert on public.tenants
  for each row execute function public.tenants_seed_setup_checklist();

-- Existing tenants (the seeded company) get their checklist now.
select public.seed_setup_checklist(id) from public.tenants;

-- RLS (data-model.md §5): admin roles read; owner and HR admin update status, due date
-- (rule-less items only; the trigger overrides the rest) and evidence. Rows are only
-- created by seed_setup_checklist() and never deleted by users.
alter table public.setup_checklist_items enable row level security;
revoke all on public.setup_checklist_items from anon;

create policy setup_checklist_items_select on public.setup_checklist_items
  for select to authenticated
  using (
    tenant_id = public.auth_tenant_id()
    and public.auth_role() in ('owner', 'hr_admin', 'payroll_approver', 'auditor')
  );
create policy setup_checklist_items_update on public.setup_checklist_items
  for update to authenticated
  using (tenant_id = public.auth_tenant_id() and public.auth_role() in ('owner', 'hr_admin'))
  with check (tenant_id = public.auth_tenant_id());

revoke insert, update, delete on public.setup_checklist_items from authenticated;
grant update (status, due_date, evidence_file_path) on public.setup_checklist_items to authenticated;

-- data-model.md §6: private bucket for company-level files.
-- Path: {tenant_id}/setup-checklist/{item_id}/{file}. 10 MB max; PDF, JPEG, PNG only
-- (enforced by Storage itself, not only the UI). Files are opened through signed URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('company', 'company', false, 10485760,
        array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

create policy company_files_select on storage.objects for select to authenticated
  using (
    bucket_id = 'company'
    and (storage.foldername(name))[1] = public.auth_tenant_id()::text
    and public.auth_role() in ('owner', 'hr_admin', 'payroll_approver', 'auditor')
  );
create policy company_files_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'company'
    and (storage.foldername(name))[1] = public.auth_tenant_id()::text
    and public.auth_role() in ('owner', 'hr_admin')
  );
create policy company_files_update on storage.objects for update to authenticated
  using (
    bucket_id = 'company'
    and (storage.foldername(name))[1] = public.auth_tenant_id()::text
    and public.auth_role() in ('owner', 'hr_admin')
  )
  with check (
    bucket_id = 'company'
    and (storage.foldername(name))[1] = public.auth_tenant_id()::text
  );
create policy company_files_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'company'
    and (storage.foldername(name))[1] = public.auth_tenant_id()::text
    and public.auth_role() in ('owner', 'hr_admin')
  );
