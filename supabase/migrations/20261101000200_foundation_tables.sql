-- Step 3 (FND-01 → FND-03, FND-07): platform tables from data-model.md §3.1 and §3.10.
-- Conventions (§1): uuid ids, tenant_id on business tables, created_at / updated_at / created_by.
-- RLS is switched on for every table in 20261101000500_rls_policies.sql.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- §3.1 tenants. Values marked TBC in company-config.yaml stay null until Step 4's setup screen.
create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  legal_name text,
  trading_name text,
  ssm_no text,
  address text,
  state_code text,
  is_msme boolean not null default true,
  epf_employer_no text,
  socso_employer_code text,
  lhdn_e_no text,
  hrdcorp_no text,
  credential_enforcement public.enforcement_mode not null default 'soft',
  default_locale text not null default 'en' check (default_locale in ('en', 'ms')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

-- §3.1 branches. Geofence is filled in at Step 4 (map picker).
create table public.branches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text,
  address text,
  geo_lat numeric(9, 6),
  geo_lng numeric(9, 6),
  geo_radius_m integer check (geo_radius_m > 0),
  operating_hours jsonb not null default '{}'::jsonb,
  state_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create index branches_tenant_id_idx on public.branches (tenant_id);

-- §3.1 memberships 🔒 (user × tenant × role). A membership starts as an invite
-- (invited_email, no user_id); the user is linked on first sign-in (see rls_helpers).
create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  invited_email text check (invited_email = lower(invited_email)),
  role public.app_role not null,
  employee_id uuid, -- FK to employees is added in Step 5
  branch_ids uuid[] not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  constraint memberships_user_or_invite check (user_id is not null or invited_email is not null),
  constraint memberships_tenant_email_key unique (tenant_id, invited_email),
  constraint memberships_tenant_user_key unique (tenant_id, user_id)
);
-- MVP is single-tenant per user; a tenant switcher can relax this when Rakan becomes SaaS.
create unique index memberships_one_active_per_user
  on public.memberships (user_id) where is_active and user_id is not null;
create index memberships_tenant_id_idx on public.memberships (tenant_id);

-- §3.10 approvals: one request per entity (leave, OT, claim, credential, payroll release …).
create table public.approvals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  requested_by uuid not null references auth.users (id),
  current_step integer not null default 1,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create index approvals_tenant_id_idx on public.approvals (tenant_id);
create index approvals_entity_idx on public.approvals (entity_type, entity_id);
create index approvals_requested_by_idx on public.approvals (requested_by);

-- §3.10 approval_steps: each step is approved by a role or by one named user.
create table public.approval_steps (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  approval_id uuid not null references public.approvals (id) on delete cascade,
  step_no integer not null check (step_no > 0),
  approver_role public.app_role,
  approver_user_id uuid references auth.users (id),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'skipped')),
  comment text,
  acted_by uuid references auth.users (id),
  acted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  constraint approval_steps_one_approver check (
    (approver_role is not null) <> (approver_user_id is not null)
  ),
  constraint approval_steps_approval_step_key unique (approval_id, step_no)
);
create index approval_steps_tenant_id_idx on public.approval_steps (tenant_id);

-- §3.10 notifications: the bell renders title/body from `template` + `data` in the viewer's
-- language; title/body columns are an optional fallback. Email delivery is tracked here.
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  template text not null,
  data jsonb not null default '{}'::jsonb,
  title text,
  body text,
  link text,
  channel text not null default 'in_app_email'
    check (channel in ('in_app', 'in_app_email')),
  read_at timestamptz,
  emailed_at timestamptz,
  email_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create index notifications_user_unread_idx
  on public.notifications (user_id, created_at desc) where read_at is null;
create index notifications_user_idx on public.notifications (user_id, created_at desc);

-- §3.10 audit_log: insert-only, written by the generic audit trigger (audit migration).
-- No foreign keys: audit rows must outlive the rows (and tenants) they describe.
create table public.audit_log (
  id bigint generated always as identity primary key,
  tenant_id uuid,
  table_name text not null,
  row_id uuid,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  old_data jsonb,
  new_data jsonb,
  actor_id uuid,
  at timestamptz not null default now()
);
create index audit_log_tenant_at_idx on public.audit_log (tenant_id, at desc);
create index audit_log_row_idx on public.audit_log (table_name, row_id);

create trigger tenants_set_updated_at before update on public.tenants
  for each row execute function public.set_updated_at();
create trigger branches_set_updated_at before update on public.branches
  for each row execute function public.set_updated_at();
create trigger memberships_set_updated_at before update on public.memberships
  for each row execute function public.set_updated_at();
create trigger approvals_set_updated_at before update on public.approvals
  for each row execute function public.set_updated_at();
create trigger approval_steps_set_updated_at before update on public.approval_steps
  for each row execute function public.set_updated_at();
create trigger notifications_set_updated_at before update on public.notifications
  for each row execute function public.set_updated_at();
