-- Step 6 (CRD-01 → CRD-16): credential catalogue, role requirement matrix, staff credentials
-- with files and HR verification, reminder bookkeeping, compliance alerts, the status views
-- (data-model.md §3.3) and the private `credentials` bucket (§6).
--
-- Credential types are seeded per company (not as shared global rows) so each company can
-- edit names, expiry rules and CPD targets in Settings.
--
-- Status of a credential for display ("validity") is derived, never stored: see
-- credential_validity() and credential_status_rows_all(). Only HR verification, renewal
-- supersede and withdrawal change staff_credentials.status, through the functions below.

create type public.credential_requirement as enum ('mandatory', 'optional');

-- Today in Malaysia (dates are compared as Malaysian calendar days).
create or replace function public.malaysia_today()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'Asia/Kuala_Lumpur')::date;
$$;

-- ── §3.3 credential_types (CRD-01, CRD-02, CRD-17, CRD-19) ─────────────────────────────
create table public.credential_types (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  code text not null check (code ~ '^[A-Z0-9_]{2,40}$'),
  name_en text not null check (btrim(name_en) <> ''),
  name_ms text not null check (btrim(name_ms) <> ''),
  category public.credential_category not null default 'other',
  issuing_body text,
  has_expiry boolean not null default true,
  default_validity_months integer check (default_validity_months between 1 and 120),
  reminder_offsets_days integer[] not null default '{90,60,30,7}'
    check (cardinality(reminder_offsets_days) between 1 and 8 and 0 < all (reminder_offsets_days)),
  requires_verification boolean not null default true,
  allowed_mime text[] not null default array['application/pdf', 'image/jpeg', 'image/png'],
  tracks_cpd boolean not null default false,
  cpd_points_required numeric(6, 1) check (cpd_points_required > 0),
  cpd_cycle_months integer check (cpd_cycle_months between 1 and 120),
  -- Health records (vaccination): the employee and HR only, never managers or auditors.
  restricted boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  constraint credential_types_tenant_code_key unique (tenant_id, code)
);
create trigger credential_types_set_updated_at before update on public.credential_types
  for each row execute function public.set_updated_at();

-- Default catalogue (CRD-01 / CRD-17). Validity months are only form defaults; issuers
-- differ per profession, so they are left blank where it depends.
create or replace function public.seed_credential_types(p_tenant_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.credential_types
    (tenant_id, code, name_en, name_ms, category, issuing_body, has_expiry,
     default_validity_months, tracks_cpd, restricted, sort_order)
  select p_tenant_id, v.* from (values
    ('MAHPC_REG', 'MAHPC registration', 'Pendaftaran MAHPC',
      'registration'::public.credential_category, 'Malaysian Allied Health Professions Council', false, null::int, false, false, 10),
    ('MMC_REG', 'MMC registration', 'Pendaftaran MMC',
      'registration', 'Malaysian Medical Council', false, null, false, false, 20),
    ('MNB_REG', 'Malaysia Nursing Board registration', 'Pendaftaran Lembaga Jururawat Malaysia',
      'registration', 'Malaysia Nursing Board', false, null, false, false, 30),
    ('APC', 'Annual practising certificate', 'Perakuan amalan tahunan',
      'practising_cert', null, true, 12, true, false, 40),
    ('BLS', 'BLS / CPR', 'BLS / CPR', 'clinical_cert', null, true, null, false, false, 50),
    ('FIRST_AID', 'First aid', 'Pertolongan cemas', 'clinical_cert', null, true, null, false, false, 60),
    ('INFECTION_CONTROL', 'Infection control training', 'Latihan kawalan jangkitan',
      'clinical_cert', null, true, null, false, false, 70),
    ('FIRE_SAFETY', 'Fire safety training', 'Latihan keselamatan kebakaran',
      'other', null, true, null, false, false, 80),
    ('INDEMNITY', 'Professional indemnity insurance', 'Insurans tanggung rugi profesional',
      'other', null, true, 12, false, false, 90),
    ('HEPB_VAX', 'Hepatitis B vaccination', 'Vaksinasi Hepatitis B',
      'vaccination', null, false, null, false, true, 100),
    ('SAFEGUARDING', 'Child safeguarding / background check', 'Perlindungan kanak-kanak / semakan latar belakang',
      'safeguarding', null, false, null, false, false, 110)
  ) as v
  on conflict (tenant_id, code) do nothing;
$$;
revoke execute on function public.seed_credential_types(uuid) from public, anon, authenticated;

create or replace function public.tenants_seed_credential_types()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.seed_credential_types(new.id);
  return null;
end;
$$;
create trigger tenants_seed_credential_types
  after insert on public.tenants
  for each row execute function public.tenants_seed_credential_types();

select public.seed_credential_types(id) from public.tenants;

-- ── §3.3 role_credential_requirements (CRD-03) ──────────────────────────────────────────
create table public.role_credential_requirements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  job_role_id uuid not null references public.job_roles (id) on delete cascade,
  credential_type_id uuid not null references public.credential_types (id) on delete cascade,
  requirement public.credential_requirement not null default 'mandatory',
  -- Hard enforcement (CRD-14): a missing / expired one blocks clinical shifts on the roster.
  blocks_roster boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  constraint role_credential_requirements_key unique (job_role_id, credential_type_id)
);
create trigger role_credential_requirements_set_updated_at
  before update on public.role_credential_requirements
  for each row execute function public.set_updated_at();

create or replace function public.role_credential_requirements_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select r.tenant_id into new.tenant_id from public.job_roles r where r.id = new.job_role_id;
  if not exists (
    select 1 from public.credential_types t
    where t.id = new.credential_type_id and t.tenant_id = new.tenant_id
  ) then
    raise exception 'Credential type belongs to another company' using errcode = '23503';
  end if;
  return new;
end;
$$;
create trigger role_credential_requirements_before_write
  before insert or update on public.role_credential_requirements
  for each row execute function public.role_credential_requirements_before_write();

-- ── §3.3 staff_credentials 🔒 (CRD-04 → CRD-10) ─────────────────────────────────────────
-- draft: being filled in / files uploading (only its author sees it in lists)
-- pending: submitted, waiting for HR · verified · rejected · superseded (a verified renewal
-- replaced it) · withdrawn (taken back while pending).
create table public.staff_credentials (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  credential_type_id uuid not null references public.credential_types (id),
  reference_no text check (char_length(reference_no) <= 100),
  issuing_body text check (char_length(issuing_body) <= 200),
  effective_date date not null,
  expiry_date date,
  cpd_points numeric(6, 1) check (cpd_points >= 0),
  notes text check (char_length(notes) <= 1000),
  status public.credential_status not null default 'draft',
  previous_id uuid references public.staff_credentials (id) on delete set null,
  submitted_by uuid default auth.uid() references auth.users (id) on delete set null,
  submitted_at timestamptz,
  approval_id uuid references public.approvals (id) on delete set null,
  verified_by uuid references auth.users (id) on delete set null,
  verified_at timestamptz,
  verify_method text,
  reject_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  constraint staff_credentials_expiry_after_effective check (expiry_date > effective_date)
);
create index staff_credentials_employee_idx on public.staff_credentials (employee_id, credential_type_id);
create index staff_credentials_tenant_status_idx on public.staff_credentials (tenant_id, status);
-- Data model: only one pending record per employee and credential type.
create unique index staff_credentials_one_pending
  on public.staff_credentials (employee_id, credential_type_id) where status = 'pending';

create trigger staff_credentials_set_updated_at before update on public.staff_credentials
  for each row execute function public.set_updated_at();
-- "a_": BEFORE triggers fire in name order, and the checks below need tenant_id.
create trigger staff_credentials_a_set_tenant
  before insert or update of employee_id on public.staff_credentials
  for each row execute function public.set_tenant_from_employee();

-- Type rules (CRD-06): an expiry date when the type expires; the issuer defaults from the
-- type; a new record for a type the person already holds is a renewal of it (CRD-07).
create or replace function public.staff_credentials_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type public.credential_types;
begin
  select * into v_type from public.credential_types t where t.id = new.credential_type_id;
  if v_type.id is null or v_type.tenant_id <> new.tenant_id then
    raise exception 'Credential type belongs to another company' using errcode = '23503';
  end if;
  if tg_op = 'INSERT' and not v_type.is_active then
    raise exception 'This credential type is no longer used' using errcode = '22023';
  end if;
  if v_type.has_expiry and new.expiry_date is null then
    raise exception 'This credential needs an expiry date' using errcode = '22023',
      hint = 'expiry_required';
  end if;
  if not v_type.has_expiry then
    new.expiry_date := null;
  end if;
  if new.issuing_body is null or btrim(new.issuing_body) = '' then
    new.issuing_body := v_type.issuing_body;
  end if;

  if tg_op = 'INSERT' then
    if new.previous_id is null then
      select s.id into new.previous_id from public.staff_credentials s
      where s.employee_id = new.employee_id
        and s.credential_type_id = new.credential_type_id
        and s.status = 'verified'
      order by s.effective_date desc
      limit 1;
    elsif not exists (
      select 1 from public.staff_credentials s
      where s.id = new.previous_id
        and s.employee_id = new.employee_id
        and s.credential_type_id = new.credential_type_id
    ) then
      raise exception 'A renewal must follow the same person''s credential of the same type'
        using errcode = '23503';
    end if;
  end if;
  return new;
end;
$$;
create trigger staff_credentials_before_write
  before insert or update on public.staff_credentials
  for each row execute function public.staff_credentials_before_write();

-- ── credential_files (CRD-05, CRD-16) ──────────────────────────────────────────────────
-- Written only by the upload-credential-file Edge Function (checks type and size).
create table public.credential_files (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  staff_credential_id uuid not null references public.staff_credentials (id) on delete cascade,
  file_path text not null,
  mime text not null,
  size_bytes integer not null check (size_bytes > 0),
  page_no integer not null default 1,
  uploaded_by uuid references auth.users (id) on delete set null,
  uploaded_at timestamptz not null default now()
);
create index credential_files_credential_idx on public.credential_files (staff_credential_id, page_no);

-- ── credential_verifications 🔒 (CRD-09) ────────────────────────────────────────────────
create table public.credential_verifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  staff_credential_id uuid not null references public.staff_credentials (id) on delete cascade,
  action text not null check (action in ('verified', 'rejected')),
  method text,
  reason text,
  verified_by uuid default auth.uid() references auth.users (id) on delete set null,
  verified_at timestamptz not null default now(),
  constraint credential_verifications_reason check (action <> 'rejected' or btrim(reason) <> '')
);
create index credential_verifications_credential_idx
  on public.credential_verifications (staff_credential_id);

-- ── credential_reminders_sent (CRD-12: no duplicate reminders) ──────────────────────────
-- offset_days 0 = the "on the expiry date / expired" reminder.
create table public.credential_reminders_sent (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  staff_credential_id uuid not null references public.staff_credentials (id) on delete cascade,
  offset_days integer not null check (offset_days >= 0),
  channel text not null default 'in_app_email',
  sent_at timestamptz not null default now(),
  constraint credential_reminders_sent_key unique (staff_credential_id, offset_days)
);

-- ── §3.10 compliance_alerts (raised by the scans; the Compliance Centre lists them) ─────
create table public.compliance_alerts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  code text not null,
  severity text not null default 'warning' check (severity in ('info', 'warning', 'critical')),
  entity_type text not null,
  entity_id uuid not null,
  employee_id uuid references public.employees (id) on delete cascade,
  message text,
  data jsonb not null default '{}'::jsonb,
  detected_at timestamptz not null default now(),
  resolved_at timestamptz
);
create unique index compliance_alerts_one_open
  on public.compliance_alerts (code, entity_id) where resolved_at is null;
create index compliance_alerts_tenant_idx on public.compliance_alerts (tenant_id, detected_at desc);

-- ── Audit ───────────────────────────────────────────────────────────────────────────────
select audit.enable('public.staff_credentials');
select audit.enable('public.credential_verifications');

-- ── Derived status ──────────────────────────────────────────────────────────────────────
-- A verified credential is upcoming before its effective date, expired the day after its
-- expiry date, expiring soon within the type's first (largest) reminder offset.
create or replace function public.credential_validity(
  p_effective date,
  p_expiry date,
  p_offsets integer[],
  p_today date
)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_effective is null then null
    when p_effective > p_today then 'upcoming'
    when p_expiry is not null and p_expiry < p_today then 'expired'
    when p_expiry is not null
      and p_expiry - p_today <= (select max(o) from unnest(p_offsets) as o) then 'expiring_soon'
    else 'valid'
  end;
$$;

-- Every (employee × credential type) that matters: what their job role requires, plus any
-- type they have submitted. One row each, all companies, for any "today".
-- display_status is what people see (CRD-04 chips); validity is the verified record's own
-- state (compliance counts it, so a pending renewal never hides a still-valid credential).
-- Not callable by users: the *_visible functions below apply the access rules.
create or replace function public.credential_status_rows_all(p_today date)
returns table (
  tenant_id uuid,
  employee_id uuid,
  credential_type_id uuid,
  requirement public.credential_requirement,
  blocks_roster boolean,
  type_code text,
  name_en text,
  name_ms text,
  category public.credential_category,
  restricted boolean,
  has_expiry boolean,
  tracks_cpd boolean,
  sort_order integer,
  verified_id uuid,
  effective_date date,
  expiry_date date,
  verified_at timestamptz,
  pending_id uuid,
  submitted_at timestamptz,
  rejected_id uuid,
  reject_reason text,
  validity text,
  display_status text,
  days_left integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with pairs as (
    select e.tenant_id, e.id as employee_id, r.credential_type_id, r.requirement, r.blocks_roster
    from public.employees e
    join public.role_credential_requirements r on r.job_role_id = e.job_role_id
    where e.deleted_at is null and e.status <> 'left'
    union all
    select distinct e.tenant_id, e.id, s.credential_type_id, null::public.credential_requirement, false
    from public.staff_credentials s
    join public.employees e on e.id = s.employee_id
    where e.deleted_at is null and e.status <> 'left'
      and s.status not in ('draft', 'withdrawn')
      and not exists (
        select 1 from public.role_credential_requirements r
        where r.job_role_id = e.job_role_id and r.credential_type_id = s.credential_type_id
      )
  )
  select
    p.tenant_id, p.employee_id, p.credential_type_id, p.requirement, p.blocks_roster,
    t.code, t.name_en, t.name_ms, t.category, t.restricted, t.has_expiry, t.tracks_cpd,
    t.sort_order,
    v.id, v.effective_date, v.expiry_date, v.verified_at,
    pe.id, pe.submitted_at,
    rj.id, rj.reject_reason,
    val.validity,
    case
      when v.id is not null and val.validity in ('valid', 'upcoming') then val.validity
      when pe.id is not null then 'pending'
      when v.id is not null then val.validity
      when rj.id is not null then 'rejected'
      else 'missing'
    end,
    case when v.expiry_date is not null then v.expiry_date - p_today end
  from pairs p
  join public.credential_types t on t.id = p.credential_type_id
  -- The verified record in force: already effective first, then the newest.
  left join lateral (
    select s.id, s.effective_date, s.expiry_date, s.verified_at
    from public.staff_credentials s
    where s.employee_id = p.employee_id and s.credential_type_id = p.credential_type_id
      and s.status = 'verified'
    order by (s.effective_date <= p_today) desc, s.effective_date desc
    limit 1
  ) v on true
  left join lateral (
    select s.id, s.submitted_at
    from public.staff_credentials s
    where s.employee_id = p.employee_id and s.credential_type_id = p.credential_type_id
      and s.status = 'pending'
    limit 1
  ) pe on true
  -- A rejection only matters if nothing newer was verified.
  left join lateral (
    select s.id, s.reject_reason
    from public.staff_credentials s
    where s.employee_id = p.employee_id and s.credential_type_id = p.credential_type_id
      and s.status = 'rejected'
      and (v.verified_at is null or s.updated_at > v.verified_at)
    order by s.updated_at desc
    limit 1
  ) rj on true
  cross join lateral (
    select public.credential_validity(v.effective_date, v.expiry_date, t.reminder_offsets_days, p_today)
      as validity
  ) val;
$$;
revoke execute on function public.credential_status_rows_all(date) from public, anon, authenticated;

-- Access rules (data-model.md §5): owner / HR admin see everything; the employee sees their
-- own; managers (their branch) and auditors see status only, never restricted types.
create or replace function public.credential_status_visible()
returns table (
  tenant_id uuid, employee_id uuid, credential_type_id uuid,
  requirement public.credential_requirement, blocks_roster boolean, type_code text,
  name_en text, name_ms text, category public.credential_category, restricted boolean,
  has_expiry boolean, tracks_cpd boolean, sort_order integer, verified_id uuid,
  effective_date date, expiry_date date, verified_at timestamptz, pending_id uuid,
  submitted_at timestamptz, rejected_id uuid, reject_reason text, validity text,
  display_status text, days_left integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.* from public.credential_status_rows_all(public.malaysia_today()) r
  where r.tenant_id = public.auth_tenant_id()
    and (
      public.auth_role() in ('owner', 'hr_admin')
      or r.employee_id = public.auth_employee_id()
      or (not r.restricted and (public.auth_role() = 'auditor' or public.is_manager_of(r.employee_id)))
    );
$$;
revoke execute on function public.credential_status_visible() from public, anon;
grant execute on function public.credential_status_visible() to authenticated;

create view public.v_credential_status as
select * from public.credential_status_visible();
revoke all on public.v_credential_status from public, anon;
grant select on public.v_credential_status to authenticated;

-- CRD-13: compliance % = valid mandatory ÷ mandatory. A credential expiring soon still counts.
create view public.v_credential_compliance as
select
  s.tenant_id,
  s.employee_id,
  count(*) filter (where s.requirement = 'mandatory')::int as mandatory_total,
  count(*) filter (
    where s.requirement = 'mandatory' and s.validity in ('valid', 'expiring_soon')
  )::int as mandatory_valid,
  case when count(*) filter (where s.requirement = 'mandatory') = 0 then null
    else round(100.0 * count(*) filter (
      where s.requirement = 'mandatory' and s.validity in ('valid', 'expiring_soon')
    ) / count(*) filter (where s.requirement = 'mandatory'))::int
  end as compliance_pct,
  min(s.expiry_date) filter (where s.validity in ('valid', 'expiring_soon')) as next_expiry_date
from public.v_credential_status s
group by s.tenant_id, s.employee_id;
revoke all on public.v_credential_compliance from public, anon;
grant select on public.v_credential_compliance to authenticated;

-- EMP-08 directory badge: one status per person from their mandatory, non-restricted
-- credentials. Every member may see it (status only, no details).
create or replace function public.credential_badges()
returns table (employee_id uuid, badge text)
language sql
stable
security definer
set search_path = ''
as $$
  select r.employee_id,
    case
      when bool_or(r.display_status = 'expired') then 'expired'
      when bool_or(r.display_status in ('missing', 'rejected')) then 'missing'
      when bool_or(r.display_status = 'pending') then 'pending'
      when bool_or(r.display_status = 'upcoming') then 'upcoming'
      when bool_or(r.display_status = 'expiring_soon') then 'expiring_soon'
      else 'valid'
    end
  from public.credential_status_rows_all(public.malaysia_today()) r
  where r.tenant_id = public.auth_tenant_id()
    and r.requirement = 'mandatory'
    and not r.restricted
  group by r.employee_id;
$$;
revoke execute on function public.credential_badges() from public, anon;
grant execute on function public.credential_badges() to authenticated;

create or replace view public.v_directory
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
  cb.badge as credential_status
from public.employees e
left join public.job_roles r on r.id = e.job_role_id
left join public.branches b on b.id = e.branch_id
left join public.credential_badges() cb on cb.employee_id = e.id
where e.tenant_id = public.auth_tenant_id()
  and e.deleted_at is null
  and e.status in ('active', 'on_notice');

-- ── Who reviews credentials: HR admin, or the owner when there is none ──────────────────
create or replace function public.hr_reviewer_role(p_tenant_id uuid)
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select case when exists (
    select 1 from public.memberships m
    where m.tenant_id = p_tenant_id and m.role = 'hr_admin' and m.is_active and m.user_id is not null
  ) then 'hr_admin'::public.app_role else 'owner'::public.app_role end;
$$;
revoke execute on function public.hr_reviewer_role(uuid) from public, anon, authenticated;

-- ── Workflow functions ──────────────────────────────────────────────────────────────────
-- Who may change a draft / pending record: its author (the employee), or owner / HR admin.
create or replace function public.can_edit_credential(p_credential public.staff_credentials)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_credential.tenant_id = public.auth_tenant_id()
    and (
      public.auth_role() in ('owner', 'hr_admin')
      or (p_credential.employee_id = public.auth_employee_id()
          and p_credential.submitted_by = auth.uid())
    );
$$;
revoke execute on function public.can_edit_credential(public.staff_credentials) from public, anon, authenticated;

-- CRD-05: draft → pending. Needs at least one file when HR must verify it. A submission
-- by the employee becomes an HR approval (notifies HR); one HR enters on someone's behalf
-- (CRD-10) waits in the same queue without an approval, so HR can verify it themselves.
create or replace function public.submit_credential(p_credential_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cred public.staff_credentials;
  v_type public.credential_types;
  v_approval_id uuid;
begin
  select * into v_cred from public.staff_credentials where id = p_credential_id for update;
  if not found or not public.can_edit_credential(v_cred) then
    raise exception 'Credential not found' using errcode = 'P0002';
  end if;
  if v_cred.status <> 'draft' then
    raise exception 'This credential was already submitted' using errcode = '22023';
  end if;
  select * into v_type from public.credential_types where id = v_cred.credential_type_id;

  if v_type.requires_verification and not exists (
    select 1 from public.credential_files f where f.staff_credential_id = v_cred.id
  ) then
    raise exception 'Upload at least one file' using errcode = '22023', hint = 'no_files';
  end if;

  if not v_type.requires_verification then
    update public.staff_credentials
    set status = 'verified', submitted_at = now(), verified_at = now(), verify_method = 'not required'
    where id = v_cred.id;
    perform public.supersede_older_credentials(v_cred.id, public.malaysia_today());
    return 'verified';
  end if;

  -- A draft started before the held credential was verified still renews it (CRD-07).
  update public.staff_credentials
  set status = 'pending', submitted_at = now(), submitted_by = coalesce(submitted_by, auth.uid()),
      previous_id = coalesce(previous_id, (
        select s.id from public.staff_credentials s
        where s.employee_id = v_cred.employee_id
          and s.credential_type_id = v_cred.credential_type_id
          and s.status = 'verified'
        order by s.effective_date desc
        limit 1
      ))
  where id = v_cred.id;

  if v_cred.employee_id = public.auth_employee_id() then
    v_approval_id := public.create_approval(
      'credential', v_cred.id,
      jsonb_build_array(jsonb_build_object('role', public.hr_reviewer_role(v_cred.tenant_id)))
    );
    update public.staff_credentials set approval_id = v_approval_id where id = v_cred.id;
  end if;
  return 'pending';
end;
$$;

-- CRD-07: a verified renewal that is already in force supersedes the older verified ones.
-- (A renewal starting in the future supersedes on its start date: credential_status_scan.)
create or replace function public.supersede_older_credentials(p_credential_id uuid, p_today date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cred public.staff_credentials;
begin
  select * into v_cred from public.staff_credentials where id = p_credential_id;
  if v_cred.status <> 'verified' or v_cred.effective_date > p_today then
    return;
  end if;
  update public.staff_credentials s
  set status = 'superseded'
  where s.employee_id = v_cred.employee_id
    and s.credential_type_id = v_cred.credential_type_id
    and s.status = 'verified'
    and s.id <> v_cred.id
    and s.effective_date <= v_cred.effective_date;
  update public.compliance_alerts a
  set resolved_at = now()
  where a.resolved_at is null and a.code = 'CRED_EXPIRED'
    and a.entity_id in (
      select s.id from public.staff_credentials s
      where s.employee_id = v_cred.employee_id
        and s.credential_type_id = v_cred.credential_type_id
        and s.status = 'superseded'
    );
end;
$$;
revoke execute on function public.supersede_older_credentials(uuid, date) from public, anon, authenticated;

-- CRD-08: withdraw while pending (author or HR).
create or replace function public.withdraw_credential(p_credential_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cred public.staff_credentials;
begin
  select * into v_cred from public.staff_credentials where id = p_credential_id for update;
  if not found or not public.can_edit_credential(v_cred) then
    raise exception 'Credential not found' using errcode = 'P0002';
  end if;
  if v_cred.status <> 'pending' then
    raise exception 'Only a pending credential can be withdrawn' using errcode = '22023';
  end if;
  update public.staff_credentials set status = 'withdrawn' where id = v_cred.id;
  update public.approvals set status = 'cancelled', decided_at = now()
  where id = v_cred.approval_id and status = 'pending';
end;
$$;

-- CRD-09: HR verifies (records the method) or rejects (reason required). When the employee
-- submitted it, the approval engine records the decision and notifies them; it also refuses
-- to let HR verify their own credential.
create or replace function public.decide_credential(
  p_credential_id uuid,
  p_decision text,
  p_note text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cred public.staff_credentials;
  v_note text := nullif(btrim(p_note), '');
begin
  if public.auth_role() is null or public.auth_role() not in ('owner', 'hr_admin') then
    raise exception 'Only the owner or HR admin can verify credentials' using errcode = '42501';
  end if;
  if p_decision not in ('verified', 'rejected') then
    raise exception 'Decision must be verified or rejected' using errcode = '22023';
  end if;
  if v_note is null then
    raise exception 'Say how it was checked, or why it is rejected' using errcode = '22023',
      hint = case when p_decision = 'verified' then 'method_required' else 'reason_required' end;
  end if;

  select * into v_cred from public.staff_credentials
  where id = p_credential_id and tenant_id = public.auth_tenant_id()
  for update;
  if not found then
    raise exception 'Credential not found' using errcode = 'P0002';
  end if;
  if v_cred.status <> 'pending' then
    raise exception 'This credential is not waiting for a decision' using errcode = '22023';
  end if;

  update public.staff_credentials
  set status = p_decision::public.credential_status,
      verified_by = case when p_decision = 'verified' then auth.uid() end,
      verified_at = case when p_decision = 'verified' then now() end,
      verify_method = case when p_decision = 'verified' then v_note end,
      reject_reason = case when p_decision = 'rejected' then v_note end
  where id = v_cred.id;

  insert into public.credential_verifications (tenant_id, staff_credential_id, action, method, reason)
  values (v_cred.tenant_id, v_cred.id, p_decision,
          case when p_decision = 'verified' then v_note end,
          case when p_decision = 'rejected' then v_note end);

  if p_decision = 'verified' then
    perform public.supersede_older_credentials(v_cred.id, public.malaysia_today());
  end if;

  if v_cred.approval_id is not null then
    perform public.act_on_approval(
      v_cred.approval_id,
      case when p_decision = 'verified' then 'approved' else 'rejected' end,
      v_note
    );
  end if;
end;
$$;

revoke execute on function public.submit_credential(uuid) from public, anon;
revoke execute on function public.withdraw_credential(uuid) from public, anon;
revoke execute on function public.decide_credential(uuid, text, text) from public, anon;
grant execute on function public.submit_credential(uuid) to authenticated;
grant execute on function public.withdraw_credential(uuid) to authenticated;
grant execute on function public.decide_credential(uuid, text, text) to authenticated;

-- If a credential approval is decided some other way (a future generic approvals screen),
-- the credential follows it.
create or replace function public.credential_on_approval_decided()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cred public.staff_credentials;
  v_comment text;
begin
  select * into v_cred from public.staff_credentials
  where id = new.entity_id and approval_id = new.id and status = 'pending'
  for update;
  if not found then
    return null;
  end if;
  select s.comment into v_comment from public.approval_steps s
  where s.approval_id = new.id order by s.step_no desc limit 1;

  if new.status = 'approved' then
    update public.staff_credentials
    set status = 'verified', verified_by = auth.uid(), verified_at = now(),
        verify_method = coalesce(v_comment, 'approved')
    where id = v_cred.id;
    insert into public.credential_verifications (tenant_id, staff_credential_id, action, method)
    values (v_cred.tenant_id, v_cred.id, 'verified', coalesce(v_comment, 'approved'));
    perform public.supersede_older_credentials(v_cred.id, public.malaysia_today());
  elsif new.status = 'rejected' then
    update public.staff_credentials
    set status = 'rejected', reject_reason = coalesce(v_comment, 'rejected')
    where id = v_cred.id;
    insert into public.credential_verifications (tenant_id, staff_credential_id, action, reason)
    values (v_cred.tenant_id, v_cred.id, 'rejected', coalesce(v_comment, 'rejected'));
  elsif new.status = 'cancelled' then
    update public.staff_credentials set status = 'withdrawn' where id = v_cred.id;
  end if;
  return null;
end;
$$;
create trigger approvals_credential_decided
  after update of status on public.approvals
  for each row
  when (new.entity_type = 'credential' and old.status = 'pending' and new.status <> 'pending')
  execute function public.credential_on_approval_decided();

-- ── Upload gate for the Edge Function (CRD-05, CRD-16) ──────────────────────────────────
-- Called with the uploader's own token: says where the file goes and which types the
-- credential type accepts, or refuses. The Edge Function then checks the bytes and size.
create or replace function public.credential_upload_target(p_credential_id uuid)
returns table (tenant_id uuid, employee_id uuid, folder text, allowed_mime text[], next_page integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_cred public.staff_credentials;
  v_count integer;
begin
  select * into v_cred from public.staff_credentials where id = p_credential_id;
  if not found or not public.can_edit_credential(v_cred) then
    raise exception 'Credential not found' using errcode = 'P0002';
  end if;
  if v_cred.status not in ('draft', 'pending') then
    raise exception 'Files can only be added before HR decides' using errcode = '22023';
  end if;
  select count(*) into v_count from public.credential_files f where f.staff_credential_id = v_cred.id;
  if v_count >= 10 then
    raise exception 'A credential can have at most 10 files' using errcode = '22023';
  end if;
  return query
    select v_cred.tenant_id, v_cred.employee_id,
           v_cred.tenant_id || '/' || v_cred.employee_id || '/' || v_cred.id || '/',
           t.allowed_mime, v_count + 1
    from public.credential_types t where t.id = v_cred.credential_type_id;
end;
$$;
revoke execute on function public.credential_upload_target(uuid) from public, anon;
grant execute on function public.credential_upload_target(uuid) to authenticated;

-- ── RLS (data-model.md §5) ──────────────────────────────────────────────────────────────
alter table public.credential_types enable row level security;
alter table public.role_credential_requirements enable row level security;
alter table public.staff_credentials enable row level security;
alter table public.credential_files enable row level security;
alter table public.credential_verifications enable row level security;
alter table public.credential_reminders_sent enable row level security;
alter table public.compliance_alerts enable row level security;

revoke all on public.credential_types, public.role_credential_requirements,
  public.staff_credentials, public.credential_files, public.credential_verifications,
  public.credential_reminders_sent, public.compliance_alerts from anon;

-- Restricted type lookup without recursing into RLS.
create or replace function public.is_restricted_credential_type(p_type_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select restricted from public.credential_types where id = p_type_id), false);
$$;

-- Catalogue and matrix: every member reads; owner and HR admin edit.
create policy credential_types_select on public.credential_types for select to authenticated
  using (tenant_id = public.auth_tenant_id());
create policy credential_types_insert on public.credential_types for insert to authenticated
  with check (tenant_id = public.auth_tenant_id() and public.auth_role() in ('owner', 'hr_admin'));
create policy credential_types_update on public.credential_types for update to authenticated
  using (tenant_id = public.auth_tenant_id() and public.auth_role() in ('owner', 'hr_admin'))
  with check (tenant_id = public.auth_tenant_id());
revoke delete on public.credential_types from authenticated;

create policy role_credential_requirements_select on public.role_credential_requirements
  for select to authenticated using (tenant_id = public.auth_tenant_id());
create policy role_credential_requirements_insert on public.role_credential_requirements
  for insert to authenticated
  with check (tenant_id = public.auth_tenant_id() and public.auth_role() in ('owner', 'hr_admin'));
create policy role_credential_requirements_update on public.role_credential_requirements
  for update to authenticated
  using (tenant_id = public.auth_tenant_id() and public.auth_role() in ('owner', 'hr_admin'))
  with check (tenant_id = public.auth_tenant_id());
create policy role_credential_requirements_delete on public.role_credential_requirements
  for delete to authenticated
  using (tenant_id = public.auth_tenant_id() and public.auth_role() in ('owner', 'hr_admin'));

-- Staff credentials: own (read, add, edit while draft / pending); owner + HR full; auditor
-- reads non-restricted. Managers get status only, through v_credential_status.
create policy staff_credentials_select on public.staff_credentials for select to authenticated
  using (
    tenant_id = public.auth_tenant_id()
    and (
      public.auth_role() in ('owner', 'hr_admin')
      or employee_id = public.auth_employee_id()
      or (public.auth_role() = 'auditor'
          and not public.is_restricted_credential_type(credential_type_id))
    )
  );
create policy staff_credentials_insert on public.staff_credentials for insert to authenticated
  with check (
    tenant_id = public.auth_tenant_id()
    and status = 'draft'
    and (
      public.auth_role() in ('owner', 'hr_admin')
      or (employee_id = public.auth_employee_id() and submitted_by = auth.uid())
    )
  );
create policy staff_credentials_update on public.staff_credentials for update to authenticated
  using (
    tenant_id = public.auth_tenant_id()
    and status in ('draft', 'pending')
    and (
      public.auth_role() in ('owner', 'hr_admin')
      or (employee_id = public.auth_employee_id() and submitted_by = auth.uid())
    )
  )
  with check (tenant_id = public.auth_tenant_id());
create policy staff_credentials_delete on public.staff_credentials for delete to authenticated
  using (
    tenant_id = public.auth_tenant_id()
    and status = 'draft'
    and (
      public.auth_role() in ('owner', 'hr_admin')
      or (employee_id = public.auth_employee_id() and submitted_by = auth.uid())
    )
  );

-- Status and decisions change only through the functions above.
revoke insert, update on public.staff_credentials from authenticated;
grant insert (employee_id, credential_type_id, reference_no, issuing_body, effective_date,
  expiry_date, cpd_points, notes, previous_id) on public.staff_credentials to authenticated;
grant update (reference_no, issuing_body, effective_date, expiry_date, cpd_points, notes)
  on public.staff_credentials to authenticated;

-- Files: the employee and owner / HR admin only (CRD-16: managers and auditors never).
create policy credential_files_select on public.credential_files for select to authenticated
  using (
    tenant_id = public.auth_tenant_id()
    and exists (
      select 1 from public.staff_credentials s
      where s.id = staff_credential_id
        and (public.auth_role() in ('owner', 'hr_admin') or s.employee_id = public.auth_employee_id())
    )
  );
revoke insert, update, delete on public.credential_files from authenticated;

create policy credential_verifications_select on public.credential_verifications
  for select to authenticated
  using (
    tenant_id = public.auth_tenant_id()
    and exists (select 1 from public.staff_credentials s where s.id = staff_credential_id)
  );
revoke insert, update, delete on public.credential_verifications from authenticated;

create policy credential_reminders_sent_select on public.credential_reminders_sent
  for select to authenticated
  using (tenant_id = public.auth_tenant_id() and public.auth_role() in ('owner', 'hr_admin', 'auditor'));
revoke insert, update, delete on public.credential_reminders_sent from authenticated;

create policy compliance_alerts_select on public.compliance_alerts for select to authenticated
  using (tenant_id = public.auth_tenant_id() and public.auth_role() in ('owner', 'hr_admin', 'auditor'));
revoke insert, update, delete on public.compliance_alerts from authenticated;

-- ── Storage: private `credentials` bucket (data-model.md §6) ────────────────────────────
-- {tenant_id}/{employee_id}/{credential_id}/{file} and {tenant_id}/{employee_id}/cpd/{id}/{file}.
-- Nobody uploads directly: the upload-credential-file Edge Function checks each file and
-- writes it with the service role. Reading is through 5-minute signed links.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('credentials', 'credentials', false, 10485760,
        array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

create policy credentials_files_select on storage.objects for select to authenticated
  using (
    bucket_id = 'credentials'
    and (storage.foldername(name))[1] = public.auth_tenant_id()::text
    and (
      public.auth_role() in ('owner', 'hr_admin')
      or (storage.foldername(name))[2] = public.auth_employee_id()::text
    )
  );
