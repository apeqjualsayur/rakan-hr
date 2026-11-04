-- Step 8 (HIR-01 → HIR-08): job openings, candidates, offers, letter templates, the
-- pre-boarding portal, "Convert to employee", onboarding tasks and probation reviews
-- (data-model.md §3.4), the private `candidates` and `letters` buckets, and the daily
-- probation reminder job (§7).
--
-- Flow:
-- 1. HR adds candidates to an opening and moves them Applied → Interview → Offer.
-- 2. HR fills in an offer; the `hiring` Edge Function renders the offer letter + contract
--    PDF from the letter templates, stores it in `letters`, and emails the candidate a
--    single-use pre-boarding link (random token; only its SHA-256 is stored; 14 days).
-- 3. Opening the link exchanges it for a pre-boarding session (also stored hashed). The
--    candidate signs the offer (click-to-sign, Step 7): that creates their employee record
--    with status 'preboarding', which the portal then fills in (personal, statutory, bank,
--    emergency contact, dependents, credentials). Candidates never get a Rakan account
--    before they are converted; every portal call goes through a preboarding_* function
--    that checks the session.
-- 4. "Convert to employee" activates the record: contract (employment_record), onboarding
--    tasks, a staff invite, credentials pending, the company's first hire date.
-- 5. Probation: reminders to the manager 30 / 14 / 7 days before it ends, a review form,
--    Owner approval, then a confirmation or extension letter (rendered by `hiring`).
--
-- Candidates are linked to their pre-boarding employee by candidates.employee_id (the
-- data model's converted_employee_id; converted_at says when it became a hire).

-- ── HIR-01 job_openings ─────────────────────────────────────────────────────────────────
create table public.job_openings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  job_role_id uuid references public.job_roles (id) on delete set null,
  title text not null check (btrim(title) <> '' and char_length(title) <= 120),
  employment_type public.employment_type not null default 'full_time',
  pay_model public.pay_model not null default 'monthly',
  salary_min numeric(12, 2) check (salary_min >= 0),
  salary_max numeric(12, 2) check (salary_max >= 0),
  branch_id uuid references public.branches (id) on delete set null,
  status text not null default 'open' check (status in ('open', 'on_hold', 'closed')),
  notes text check (char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  constraint job_openings_salary_range check (salary_max >= salary_min)
);
create index job_openings_tenant_idx on public.job_openings (tenant_id, status);
create trigger job_openings_set_updated_at before update on public.job_openings
  for each row execute function public.set_updated_at();

-- Role and branch must belong to the same company.
create or replace function public.job_openings_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.job_role_id is not null and not exists (
    select 1 from public.job_roles r where r.id = new.job_role_id and r.tenant_id = new.tenant_id
  ) then
    raise exception 'Job role belongs to another company' using errcode = '23503';
  end if;
  if new.branch_id is not null and not exists (
    select 1 from public.branches b where b.id = new.branch_id and b.tenant_id = new.tenant_id
  ) then
    raise exception 'Branch belongs to another company' using errcode = '23503';
  end if;
  return new;
end;
$$;
create trigger job_openings_before_write
  before insert or update on public.job_openings
  for each row execute function public.job_openings_before_write();

-- ── HIR-02 candidates ───────────────────────────────────────────────────────────────────
create table public.candidates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  job_opening_id uuid not null references public.job_openings (id) on delete restrict,
  full_name text not null check (btrim(full_name) <> '' and char_length(full_name) <= 200),
  email text not null check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 254),
  phone text check (char_length(phone) <= 30),
  cv_path text,
  stage public.candidate_stage not null default 'applied',
  stage_changed_at timestamptz not null default now(),
  notes text check (char_length(notes) <= 4000),
  rejected_reason text check (char_length(rejected_reason) <= 500),
  offer_sent_at timestamptz,
  offer_accepted_at timestamptz,
  -- Single-use link (HIR-04): only hashes are stored. The link is exchanged once for a
  -- session; both expire.
  preboarding_token_hash text,
  preboarding_token_expires_at timestamptz,
  preboarding_token_used_at timestamptz,
  preboarding_session_hash text,
  preboarding_session_expires_at timestamptz,
  preboarding_submitted_at timestamptz,
  employee_id uuid references public.employees (id) on delete set null,
  converted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create index candidates_tenant_stage_idx on public.candidates (tenant_id, stage);
create index candidates_opening_idx on public.candidates (job_opening_id);
create unique index candidates_token_key on public.candidates (preboarding_token_hash)
  where preboarding_token_hash is not null;
create unique index candidates_session_key on public.candidates (preboarding_session_hash)
  where preboarding_session_hash is not null;
create trigger candidates_set_updated_at before update on public.candidates
  for each row execute function public.set_updated_at();

-- The opening must belong to the candidate's company. Stage moves are recorded; 'hired'
-- only comes from convert_candidate(), and a candidate who has accepted can only be
-- rejected (which also closes their pre-boarding), never moved back.
create or replace function public.candidates_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.job_openings o where o.id = new.job_opening_id and o.tenant_id = new.tenant_id
  ) then
    raise exception 'Job opening belongs to another company' using errcode = '23503';
  end if;
  new.email := lower(btrim(new.email));

  if tg_op = 'INSERT' then
    if new.stage = 'hired' then
      raise exception 'Use Convert to employee' using errcode = '22023', hint = 'use_convert';
    end if;
  elsif new.stage is distinct from old.stage then
    if current_setting('rakan.hiring_internal', true) is distinct from 'on' then
      if new.stage = 'hired' then
        raise exception 'Use Convert to employee' using errcode = '22023', hint = 'use_convert';
      end if;
      if old.stage = 'hired' or (old.offer_accepted_at is not null and new.stage <> 'rejected') then
        raise exception 'This candidate has accepted an offer' using errcode = '22023',
          hint = 'offer_accepted';
      end if;
    end if;
    new.stage_changed_at := now();
  end if;
  return new;
end;
$$;
create trigger candidates_before_write
  before insert or update on public.candidates
  for each row execute function public.candidates_before_write();

-- Rejecting closes everything that is still open for the candidate: the link and session,
-- an unsigned offer, and a pre-boarding record (soft-deleted; employees are never deleted).
create or replace function public.candidates_after_reject()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.candidates
  set preboarding_token_hash = null, preboarding_session_hash = null
  where id = new.id and (preboarding_token_hash is not null or preboarding_session_hash is not null);
  perform set_config('rakan.hiring_internal', 'on', true);
  update public.offers set status = 'withdrawn'
  where candidate_id = new.id and status in ('draft', 'sent');
  perform set_config('rakan.hiring_internal', 'off', true);
  if new.employee_id is not null and new.converted_at is null then
    update public.employees set status = 'left', deleted_at = now()
    where id = new.employee_id and status = 'preboarding';
  end if;
  return null;
end;
$$;

-- ── HIR-03 offers ───────────────────────────────────────────────────────────────────────
-- One open offer per candidate (draft, sent or accepted). Changing a sent offer means
-- withdrawing it and sending a new one. pdf_path + document_sha256 identify the exact
-- letter the candidate signs.
create table public.offers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  candidate_id uuid not null references public.candidates (id) on delete cascade,
  status text not null default 'draft'
    check (status in ('draft', 'sent', 'accepted', 'withdrawn')),
  locale text not null default 'en' check (locale in ('en', 'ms')),
  job_title text not null check (btrim(job_title) <> '' and char_length(job_title) <= 120),
  job_role_id uuid references public.job_roles (id) on delete set null,
  branch_id uuid references public.branches (id) on delete set null,
  manager_id uuid references public.employees (id) on delete set null,
  employment_type public.employment_type not null,
  pay_model public.pay_model not null,
  basic_salary numeric(12, 2) check (basic_salary >= 0),
  hourly_rate numeric(12, 2) check (hourly_rate >= 0),
  session_rate numeric(12, 2) check (session_rate >= 0),
  normal_hours_per_day numeric(4, 2) not null
    check (normal_hours_per_day > 0 and normal_hours_per_day <= 24),
  work_days_per_week numeric(3, 1) not null
    check (work_days_per_week > 0 and work_days_per_week <= 7),
  start_date date not null,
  contract_end_date date,
  probation_months integer not null default 3 check (probation_months between 0 and 12),
  extra_terms text check (char_length(extra_terms) <= 4000),
  pdf_path text,
  document_sha256 text check (document_sha256 ~ '^[0-9a-f]{64}$'),
  sent_at timestamptz,
  expires_at timestamptz,
  accepted_at timestamptz,
  signature_id uuid references public.signatures (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  constraint offers_contract_end_after_start check (contract_end_date > start_date),
  constraint offers_rate_for_pay_model check (
    case pay_model
      when 'monthly' then basic_salary is not null
      when 'hourly' then hourly_rate is not null
      when 'per_session' then session_rate is not null
    end
  ),
  constraint offers_sent_has_pdf check (status = 'draft' or status = 'withdrawn' or pdf_path is not null)
);
create unique index offers_one_open on public.offers (candidate_id)
  where status in ('draft', 'sent', 'accepted');
create trigger offers_set_updated_at before update on public.offers
  for each row execute function public.set_updated_at();

create or replace function public.set_tenant_from_candidate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select c.tenant_id into new.tenant_id from public.candidates c where c.id = new.candidate_id;
  if new.tenant_id is null then
    raise exception 'Candidate not found' using errcode = '23503';
  end if;
  return new;
end;
$$;
create trigger offers_a_set_tenant
  before insert or update of candidate_id on public.offers
  for each row execute function public.set_tenant_from_candidate();

-- Only a draft can be edited; role, branch and manager must be the company's own.
create or replace function public.offers_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and old.status <> 'draft'
     and current_setting('rakan.hiring_internal', true) is distinct from 'on' then
    raise exception 'Only a draft offer can be changed' using errcode = '22023', hint = 'offer_not_draft';
  end if;
  if new.job_role_id is not null and not exists (
    select 1 from public.job_roles r where r.id = new.job_role_id and r.tenant_id = new.tenant_id
  ) then
    raise exception 'Job role belongs to another company' using errcode = '23503';
  end if;
  if new.branch_id is not null and not exists (
    select 1 from public.branches b where b.id = new.branch_id and b.tenant_id = new.tenant_id
  ) then
    raise exception 'Branch belongs to another company' using errcode = '23503';
  end if;
  if new.manager_id is not null and not exists (
    select 1 from public.employees e
    where e.id = new.manager_id and e.tenant_id = new.tenant_id and e.deleted_at is null
  ) then
    raise exception 'Manager belongs to another company' using errcode = '23503';
  end if;
  return new;
end;
$$;
create trigger offers_before_write
  before insert or update on public.offers
  for each row execute function public.offers_before_write();

create trigger candidates_after_reject
  after update of stage on public.candidates
  for each row when (new.stage = 'rejected' and old.stage <> 'rejected')
  execute function public.candidates_after_reject();

-- Signatures by candidates (HIR-08): one per offer and candidate.
alter table public.signatures
  add constraint signatures_signer_candidate_id_fkey
  foreign key (signer_candidate_id) references public.candidates (id) on delete set null;
create unique index signatures_one_per_candidate
  on public.signatures (entity_type, entity_id, signer_candidate_id)
  where signer_candidate_id is not null;

-- ── HIR-03 letter_templates ─────────────────────────────────────────────────────────────
-- Plain text with a few marks: "# " title, "## " heading, "- " bullet, a blank line between
-- paragraphs, and {{merge_field}} placeholders (list in src/lib/hiring/letters.ts).
-- is_draft = placeholder wording: every page of the PDF is stamped DRAFT until the owner
-- pastes lawyer-reviewed wording and switches it off.
create table public.letter_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  kind text not null check (kind in ('offer', 'contract', 'confirmation', 'extension')),
  locale text not null check (locale in ('en', 'ms')),
  title text not null check (btrim(title) <> '' and char_length(title) <= 200),
  body text not null check (btrim(body) <> '' and char_length(body) <= 40000),
  is_draft boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  constraint letter_templates_kind_locale_key unique (tenant_id, kind, locale)
);
create trigger letter_templates_set_updated_at before update on public.letter_templates
  for each row execute function public.set_updated_at();

create or replace function public.letter_templates_before_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_by := auth.uid();
  return new;
end;
$$;
create trigger letter_templates_before_update
  before update on public.letter_templates
  for each row execute function public.letter_templates_before_update();

-- ── HIR-05 / HIR-06 onboarding_tasks ────────────────────────────────────────────────────
-- code = one of the default tasks (translated in the app); custom tasks only have a title.
create table public.onboarding_tasks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  code text check (code ~ '^[A-Z_]{2,40}$'),
  title text not null check (btrim(title) <> '' and char_length(title) <= 200),
  owner_role public.app_role not null default 'hr_admin',
  due_date date,
  sort_order integer not null default 0,
  done_at timestamptz,
  done_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  constraint onboarding_tasks_employee_code_key unique (employee_id, code)
);
create index onboarding_tasks_employee_idx on public.onboarding_tasks (employee_id, sort_order);
create trigger onboarding_tasks_a_set_tenant
  before insert or update of employee_id on public.onboarding_tasks
  for each row execute function public.set_tenant_from_employee();
create trigger onboarding_tasks_set_updated_at before update on public.onboarding_tasks
  for each row execute function public.set_updated_at();

create or replace function public.onboarding_tasks_before_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.done_at is distinct from old.done_at then
    new.done_by := case when new.done_at is null then null else auth.uid() end;
  end if;
  return new;
end;
$$;
create trigger onboarding_tasks_before_update
  before update on public.onboarding_tasks
  for each row execute function public.onboarding_tasks_before_update();

-- ── HIR-07 probation_reviews 🔒 ─────────────────────────────────────────────────────────
-- Criteria (1–5 each): quality, skills, reliability, teamwork, conduct.
create or replace function public.valid_probation_ratings(p_ratings jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(p_ratings) = 'object'
    and (select count(*) from jsonb_object_keys(p_ratings)) = 5
    and not exists (
      select 1 from jsonb_each(p_ratings) r
      where r.key not in ('quality', 'skills', 'reliability', 'teamwork', 'conduct')
        or jsonb_typeof(r.value) <> 'number'
        or (r.value)::text !~ '^[1-5]$'
    );
$$;

create table public.probation_reviews (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  employment_record_id uuid not null references public.employment_records (id) on delete cascade,
  reviewer_id uuid default auth.uid() references auth.users (id) on delete set null,
  due_date date not null,
  ratings jsonb not null check (public.valid_probation_ratings(ratings)),
  comments text not null check (btrim(comments) <> '' and char_length(comments) <= 4000),
  recommendation text not null check (recommendation in ('confirm', 'extend', 'end')),
  extend_months integer check (extend_months between 1 and 6),
  status text not null default 'submitted'
    check (status in ('submitted', 'approved', 'rejected', 'cancelled')),
  approval_id uuid references public.approvals (id) on delete set null,
  decided_at timestamptz,
  confirmed_on date,
  new_probation_end date,
  letter_path text,
  letter_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  constraint probation_reviews_extend_months check ((recommendation = 'extend') = (extend_months is not null))
);
create index probation_reviews_employee_idx on public.probation_reviews (employee_id, created_at desc);
create unique index probation_reviews_one_open
  on public.probation_reviews (employee_id) where status = 'submitted';
create trigger probation_reviews_a_set_tenant
  before insert or update of employee_id on public.probation_reviews
  for each row execute function public.set_tenant_from_employee();
create trigger probation_reviews_set_updated_at before update on public.probation_reviews
  for each row execute function public.set_updated_at();

select audit.enable('public.candidates');
select audit.enable('public.offers');
select audit.enable('public.probation_reviews');

create table public.probation_reminders_sent (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  probation_end date not null,
  days_before integer not null,
  sent_at timestamptz not null default now(),
  constraint probation_reminders_sent_key unique (employee_id, probation_end, days_before)
);

-- Probation letters (HIR-07) are filed with the employee's documents.
alter table public.documents drop constraint documents_doc_type_check;
alter table public.documents add constraint documents_doc_type_check check (doc_type in (
  'ic_copy', 'passport', 'work_permit', 'contract', 'offer_letter', 'probation_letter',
  'certificate', 'other'
));

-- ── Placeholder letter wording (HIR-03) ─────────────────────────────────────────────────
-- DRAFT wording only, until the owner pastes lawyer-reviewed text in Settings > Letter
-- templates. The contract carries the Employment Act 1955 minimum terms from
-- payroll-rules.md §5 (hours, overtime, rest day, public holidays), §6 (leave) and §11
-- (notice, termination); items marked ⚠ VERIFY there must be checked by the lawyer.
create or replace function public.seed_letter_templates(p_tenant_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.letter_templates (tenant_id, kind, locale, title, body, is_draft, created_by, updated_by)
  select p_tenant_id, v.kind, v.locale, v.title, v.body, true, null, null from (values
  ('offer', 'en', 'Offer of employment', $t$# Offer of employment

{{today}}

{{name}}

Dear {{name}},

We are pleased to offer you the position of {{job_title}} at {{company_name}}, based at {{branch_name}}. This offer is made on the terms below and in the employment contract that follows this letter.

## Key terms

- Position: {{job_title}}
- Employment type: {{employment_type}}
- Start date: {{start_date}}
- Pay: {{pay}}
- Working hours: {{normal_hours_per_day}} hours a day, {{work_days_per_week}} days a week
- Probation: {{probation_months}} months, ending on {{probation_end}}
- Reporting to: {{manager_name}}

{{extra_terms}}

## Before you start

Once you accept, you will be asked to give your personal, statutory and bank details, an emergency contact, and copies of the professional registrations, practising certificates and training required for your role.

## How to accept

Please read this letter and the contract carefully, then accept both by typing your full name in Rakan by {{offer_expiry_date}}. This offer lapses if it is not accepted by that date.

We look forward to welcoming you to the team.

Yours sincerely,

For and on behalf of {{company_name}}$t$),
  ('offer', 'ms', 'Tawaran pekerjaan', $t$# Tawaran pekerjaan

{{today}}

{{name}}

{{name}} yang dihormati,

Dengan sukacitanya kami menawarkan jawatan {{job_title}} di {{company_name}}, bertempat di {{branch_name}}. Tawaran ini dibuat mengikut syarat di bawah dan kontrak pekerjaan yang dilampirkan selepas surat ini.

## Syarat utama

- Jawatan: {{job_title}}
- Jenis pekerjaan: {{employment_type}}
- Tarikh mula: {{start_date}}
- Gaji: {{pay}}
- Waktu bekerja: {{normal_hours_per_day}} jam sehari, {{work_days_per_week}} hari seminggu
- Tempoh percubaan: {{probation_months}} bulan, tamat pada {{probation_end}}
- Melapor kepada: {{manager_name}}

{{extra_terms}}

## Sebelum anda mula bekerja

Selepas menerima tawaran ini, anda akan diminta memberikan butiran peribadi, berkanun dan bank, maklumat orang yang boleh dihubungi semasa kecemasan, serta salinan pendaftaran profesional, perakuan amalan dan latihan yang diperlukan untuk jawatan anda.

## Cara menerima tawaran

Sila baca surat ini dan kontrak dengan teliti, kemudian terima kedua-duanya dengan menaip nama penuh anda dalam Rakan sebelum {{offer_expiry_date}}. Tawaran ini luput jika tidak diterima sebelum tarikh tersebut.

Kami menantikan kehadiran anda dalam pasukan kami.

Yang benar,

Bagi pihak {{company_name}}$t$),
  ('contract', 'en', 'Employment contract', $t$# Employment contract

This contract is made on {{today}} between {{company_name}} ({{company_reg_no}}) of {{company_address}} ("the Employer") and {{name}} ("the Employee").

## 1. Position and start date

The Employee is employed as {{job_title}} on a {{employment_type}} basis from {{start_date}}, at {{branch_name}} or another branch of the Employer where reasonably required. {{contract_end}}

## 2. Probation

The first {{probation_months}} months are a probation period ending on {{probation_end}}. Before it ends, the Employer will review the Employee's performance and will confirm the appointment, extend the probation in writing, or end the employment with notice under clause 9.

## 3. Pay

The Employee is paid {{pay}}. Wages are paid no later than the 7th day after the end of each monthly wage period, by transfer to the Employee's bank account, less lawful deductions (EPF, SOCSO, EIS, monthly tax deductions and other deductions allowed by the Employment Act 1955).

## 4. Working hours and rest day

Normal working hours are {{normal_hours_per_day}} hours a day over {{work_days_per_week}} days a week, and not more than 45 hours a week. The Employee is entitled to one rest day each week.

## 5. Overtime, rest day and public holiday work

Where the Employment Act 1955 applies to the Employee, work approved by the Employer is paid at not less than:

- 1.5 times the hourly rate of pay for overtime on a normal working day;
- on a rest day: half a day's wages for work of up to half the normal hours, one day's wages for work of more than half and up to the normal hours, and 2 times the hourly rate for each hour beyond the normal hours;
- on a public holiday: 2 days' wages for the normal hours, in addition to the holiday pay, and 3 times the hourly rate for each hour beyond the normal hours.

Overtime must be approved in advance and may not exceed the monthly limit set by law (104 hours).

## 6. Public holidays

The Employee is entitled to 11 paid public holidays a year, including National Day, the Birthday of the Yang di-Pertuan Agong, the Birthday of the Ruler of the State or Federal Territory Day, Labour Day and Malaysia Day. When a public holiday falls on a rest day, the next working day is a paid holiday.

## 7. Leave

The Employee is entitled to at least the following paid leave each calendar year, pro-rated in the first and last year of service:

- Annual leave: 8 days with less than 2 years' service, 12 days with 2 to 5 years, 16 days with 5 years or more.
- Sick leave (no hospitalisation): 14 days with less than 2 years' service, 18 days with 2 to 5 years, 22 days with 5 years or more, on a medical certificate.
- Hospitalisation leave: up to 60 days a year in total when hospitalisation is necessary.
- Maternity leave: 98 consecutive days, on the conditions of the Employment Act 1955.
- Paternity leave: 7 consecutive days for a married male employee with at least 12 months' service, for up to 5 confinements.

The Employer's leave policy may give more than these minimums, never less.

## 8. Professional registration and credentials

The Employee must hold, and keep valid, every registration, practising certificate and training required for the role, and upload renewals to Rakan before they expire.

## 9. Ending the employment

Either party may end this contract by written notice, or by paying wages in place of notice, of at least:

- 4 weeks with less than 2 years' service;
- 6 weeks with 2 to 5 years' service;
- 8 weeks with 5 years' service or more.

Termination and lay-off benefits are paid where the law requires them. Final wages are paid on time.

## 10. Confidentiality and personal data

The Employee keeps client, patient and business information confidential, during and after the employment. The Employer handles the Employee's personal data as set out in its PDPA privacy notice.

## 11. Policies

The Employee follows the Employer's policies and handbook as updated from time to time.

## Acceptance

By typing their full name in Rakan, the Employee accepts the offer letter and this contract. The signature record at the end of this document shows who accepted, when, and the fingerprint of these pages.

For and on behalf of {{company_name}}$t$),
  ('contract', 'ms', 'Kontrak pekerjaan', $t$# Kontrak pekerjaan

Kontrak ini dibuat pada {{today}} antara {{company_name}} ({{company_reg_no}}) beralamat di {{company_address}} ("Majikan") dan {{name}} ("Pekerja").

## 1. Jawatan dan tarikh mula

Pekerja diambil bekerja sebagai {{job_title}} secara {{employment_type}} mulai {{start_date}}, di {{branch_name}} atau cawangan lain Majikan apabila diperlukan secara munasabah. {{contract_end}}

## 2. Tempoh percubaan

{{probation_months}} bulan pertama ialah tempoh percubaan yang tamat pada {{probation_end}}. Sebelum tempoh itu tamat, Majikan akan menilai prestasi Pekerja dan akan mengesahkan jawatan, melanjutkan tempoh percubaan secara bertulis, atau menamatkan pekerjaan dengan notis di bawah fasal 9.

## 3. Gaji

Pekerja dibayar {{pay}}. Gaji dibayar tidak lewat daripada hari ke-7 selepas tamat setiap tempoh gaji bulanan, melalui pindahan ke akaun bank Pekerja, selepas potongan yang sah (KWSP, PERKESO, SIP, potongan cukai bulanan dan potongan lain yang dibenarkan oleh Akta Kerja 1955).

## 4. Waktu bekerja dan hari rehat

Waktu bekerja biasa ialah {{normal_hours_per_day}} jam sehari selama {{work_days_per_week}} hari seminggu, dan tidak melebihi 45 jam seminggu. Pekerja berhak mendapat satu hari rehat setiap minggu.

## 5. Kerja lebih masa, kerja pada hari rehat dan cuti umum

Jika Akta Kerja 1955 terpakai kepada Pekerja, kerja yang diluluskan oleh Majikan dibayar tidak kurang daripada:

- 1.5 kali kadar gaji sejam untuk kerja lebih masa pada hari bekerja biasa;
- pada hari rehat: gaji setengah hari untuk kerja sehingga separuh waktu biasa, gaji sehari untuk kerja melebihi separuh hingga waktu biasa, dan 2 kali kadar gaji sejam bagi setiap jam melebihi waktu biasa;
- pada hari cuti umum: gaji 2 hari untuk waktu biasa, sebagai tambahan kepada gaji cuti, dan 3 kali kadar gaji sejam bagi setiap jam melebihi waktu biasa.

Kerja lebih masa mesti diluluskan terlebih dahulu dan tidak boleh melebihi had bulanan yang ditetapkan oleh undang-undang (104 jam).

## 6. Cuti umum

Pekerja berhak mendapat 11 hari cuti umum bergaji setahun, termasuk Hari Kebangsaan, Hari Keputeraan Yang di-Pertuan Agong, Hari Keputeraan Raja Negeri atau Hari Wilayah Persekutuan, Hari Pekerja dan Hari Malaysia. Jika cuti umum jatuh pada hari rehat, hari bekerja berikutnya ialah cuti bergaji.

## 7. Cuti

Pekerja berhak mendapat sekurang-kurangnya cuti bergaji berikut setiap tahun kalendar, dikira secara pro rata pada tahun pertama dan terakhir perkhidmatan:

- Cuti tahunan: 8 hari bagi perkhidmatan kurang 2 tahun, 12 hari bagi 2 hingga 5 tahun, 16 hari bagi 5 tahun atau lebih.
- Cuti sakit (tanpa dimasukkan ke hospital): 14 hari bagi perkhidmatan kurang 2 tahun, 18 hari bagi 2 hingga 5 tahun, 22 hari bagi 5 tahun atau lebih, dengan sijil cuti sakit.
- Cuti hospital: sehingga 60 hari setahun secara keseluruhan apabila perlu dimasukkan ke hospital.
- Cuti bersalin: 98 hari berturut-turut, tertakluk kepada syarat Akta Kerja 1955.
- Cuti paterniti: 7 hari berturut-turut bagi pekerja lelaki yang berkahwin dengan perkhidmatan sekurang-kurangnya 12 bulan, untuk sehingga 5 kelahiran.

Polisi cuti Majikan boleh memberikan lebih daripada minimum ini, tetapi tidak kurang.

## 8. Pendaftaran profesional dan kelayakan

Pekerja mesti memiliki, dan memastikan sah, setiap pendaftaran, perakuan amalan dan latihan yang diperlukan untuk jawatan, serta memuat naik pembaharuannya ke Rakan sebelum tamat tempoh.

## 9. Penamatan pekerjaan

Mana-mana pihak boleh menamatkan kontrak ini dengan notis bertulis, atau dengan membayar gaji sebagai ganti notis, sekurang-kurangnya:

- 4 minggu bagi perkhidmatan kurang 2 tahun;
- 6 minggu bagi perkhidmatan 2 hingga 5 tahun;
- 8 minggu bagi perkhidmatan 5 tahun atau lebih.

Faedah penamatan dan pemberhentian sementara dibayar apabila dikehendaki oleh undang-undang. Gaji akhir dibayar tepat pada masanya.

## 10. Kerahsiaan dan data peribadi

Pekerja merahsiakan maklumat pelanggan, pesakit dan perniagaan, semasa dan selepas tempoh pekerjaan. Majikan mengendalikan data peribadi Pekerja seperti yang dinyatakan dalam notis privasi PDPA.

## 11. Polisi

Pekerja mematuhi polisi dan buku panduan Majikan seperti yang dikemas kini dari semasa ke semasa.

## Penerimaan

Dengan menaip nama penuh dalam Rakan, Pekerja menerima surat tawaran dan kontrak ini. Rekod tandatangan di hujung dokumen ini menunjukkan siapa yang menerima, bila, dan cap jari halaman-halaman ini.

Bagi pihak {{company_name}}$t$),
  ('confirmation', 'en', 'Confirmation of employment', $t$# Confirmation of employment

{{today}}

{{name}}
{{job_title}}

Dear {{name}},

We are pleased to tell you that you have completed your probation. Your appointment as {{job_title}} is confirmed with effect from {{confirmation_date}}.

All other terms of your employment contract stay the same.

Thank you for your work during probation. We look forward to working with you.

Yours sincerely,

For and on behalf of {{company_name}}$t$),
  ('confirmation', 'ms', 'Pengesahan jawatan', $t$# Pengesahan jawatan

{{today}}

{{name}}
{{job_title}}

{{name}} yang dihormati,

Dengan sukacitanya kami memaklumkan bahawa anda telah menamatkan tempoh percubaan. Jawatan anda sebagai {{job_title}} disahkan berkuat kuasa mulai {{confirmation_date}}.

Syarat-syarat lain dalam kontrak pekerjaan anda kekal tidak berubah.

Terima kasih atas sumbangan anda sepanjang tempoh percubaan. Kami menantikan kerjasama anda seterusnya.

Yang benar,

Bagi pihak {{company_name}}$t$),
  ('extension', 'en', 'Extension of probation', $t$# Extension of probation

{{today}}

{{name}}
{{job_title}}

Dear {{name}},

Following your probation review, your probation as {{job_title}} is extended by {{extension_months}} months. It will now end on {{new_probation_end}}.

Your manager will go through the areas to work on during this period, and your performance will be reviewed again before the new end date.

All other terms of your employment contract stay the same.

Yours sincerely,

For and on behalf of {{company_name}}$t$),
  ('extension', 'ms', 'Lanjutan tempoh percubaan', $t$# Lanjutan tempoh percubaan

{{today}}

{{name}}
{{job_title}}

{{name}} yang dihormati,

Berikutan penilaian tempoh percubaan anda, tempoh percubaan anda sebagai {{job_title}} dilanjutkan selama {{extension_months}} bulan. Tempoh itu kini akan tamat pada {{new_probation_end}}.

Pengurus anda akan membincangkan perkara yang perlu diperbaiki sepanjang tempoh ini, dan prestasi anda akan dinilai semula sebelum tarikh tamat yang baharu.

Syarat-syarat lain dalam kontrak pekerjaan anda kekal tidak berubah.

Yang benar,

Bagi pihak {{company_name}}$t$)
  ) as v (kind, locale, title, body)
  on conflict (tenant_id, kind, locale) do nothing;
$$;
revoke execute on function public.seed_letter_templates(uuid) from public, anon, authenticated;

create or replace function public.tenants_seed_letter_templates()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.seed_letter_templates(new.id);
  return null;
end;
$$;
create trigger tenants_seed_letter_templates
  after insert on public.tenants
  for each row execute function public.tenants_seed_letter_templates();

select public.seed_letter_templates(id) from public.tenants;

-- ── RLS (data-model.md §5) ──────────────────────────────────────────────────────────────
-- Hiring is run by the owner and HR admin; the auditor reads. Candidates never sign in:
-- the portal works only through the preboarding_* functions below.
alter table public.job_openings enable row level security;
alter table public.candidates enable row level security;
alter table public.offers enable row level security;
alter table public.letter_templates enable row level security;
alter table public.onboarding_tasks enable row level security;
alter table public.probation_reviews enable row level security;
alter table public.probation_reminders_sent enable row level security;

revoke all on public.job_openings, public.candidates, public.offers, public.letter_templates,
  public.onboarding_tasks, public.probation_reviews, public.probation_reminders_sent from anon;

create policy job_openings_select on public.job_openings for select to authenticated
  using (tenant_id = public.auth_tenant_id() and public.auth_role() in ('owner', 'hr_admin', 'auditor'));
create policy job_openings_insert on public.job_openings for insert to authenticated
  with check (tenant_id = public.auth_tenant_id() and public.auth_role() in ('owner', 'hr_admin'));
create policy job_openings_update on public.job_openings for update to authenticated
  using (tenant_id = public.auth_tenant_id() and public.auth_role() in ('owner', 'hr_admin'))
  with check (tenant_id = public.auth_tenant_id());
create policy job_openings_delete on public.job_openings for delete to authenticated
  using (tenant_id = public.auth_tenant_id() and public.auth_role() in ('owner', 'hr_admin'));

create policy candidates_select on public.candidates for select to authenticated
  using (tenant_id = public.auth_tenant_id() and public.auth_role() in ('owner', 'hr_admin', 'auditor'));
create policy candidates_insert on public.candidates for insert to authenticated
  with check (tenant_id = public.auth_tenant_id() and public.auth_role() in ('owner', 'hr_admin'));
create policy candidates_update on public.candidates for update to authenticated
  using (tenant_id = public.auth_tenant_id() and public.auth_role() in ('owner', 'hr_admin'))
  with check (tenant_id = public.auth_tenant_id());
-- Candidates are kept (audit); the link and session hashes are never readable.
revoke select, insert, update, delete, truncate on public.candidates from authenticated;
grant select (
  id, tenant_id, job_opening_id, full_name, email, phone, cv_path, stage, stage_changed_at,
  notes, rejected_reason, offer_sent_at, offer_accepted_at, preboarding_token_expires_at,
  preboarding_token_used_at, preboarding_session_expires_at, preboarding_submitted_at,
  employee_id, converted_at, created_at, updated_at, created_by
) on public.candidates to authenticated;
grant insert (tenant_id, job_opening_id, full_name, email, phone, cv_path, stage, notes)
  on public.candidates to authenticated;
grant update (job_opening_id, full_name, email, phone, cv_path, stage, notes, rejected_reason)
  on public.candidates to authenticated;

create policy offers_select on public.offers for select to authenticated
  using (tenant_id = public.auth_tenant_id() and public.auth_role() in ('owner', 'hr_admin', 'auditor'));
create policy offers_insert on public.offers for insert to authenticated
  with check (tenant_id = public.auth_tenant_id() and public.auth_role() in ('owner', 'hr_admin'));
create policy offers_update on public.offers for update to authenticated
  using (tenant_id = public.auth_tenant_id() and public.auth_role() in ('owner', 'hr_admin'))
  with check (tenant_id = public.auth_tenant_id());
create policy offers_delete on public.offers for delete to authenticated
  using (tenant_id = public.auth_tenant_id() and public.auth_role() in ('owner', 'hr_admin')
         and status = 'draft');
-- Sending, accepting and withdrawing go through functions.
revoke insert, update on public.offers from authenticated;
grant insert (
  candidate_id, locale, job_title, job_role_id, branch_id, manager_id, employment_type,
  pay_model, basic_salary, hourly_rate, session_rate, normal_hours_per_day,
  work_days_per_week, start_date, contract_end_date, probation_months, extra_terms
) on public.offers to authenticated;
grant update (
  locale, job_title, job_role_id, branch_id, manager_id, employment_type, pay_model,
  basic_salary, hourly_rate, session_rate, normal_hours_per_day, work_days_per_week,
  start_date, contract_end_date, probation_months, extra_terms
) on public.offers to authenticated;

create policy letter_templates_select on public.letter_templates for select to authenticated
  using (tenant_id = public.auth_tenant_id() and public.auth_role() in ('owner', 'hr_admin', 'auditor'));
create policy letter_templates_update on public.letter_templates for update to authenticated
  using (tenant_id = public.auth_tenant_id() and public.auth_role() in ('owner', 'hr_admin'))
  with check (tenant_id = public.auth_tenant_id());
revoke insert, update, delete, truncate on public.letter_templates from authenticated;
grant update (title, body, is_draft) on public.letter_templates to authenticated;

create policy onboarding_tasks_select on public.onboarding_tasks for select to authenticated
  using (
    tenant_id = public.auth_tenant_id()
    and (public.auth_role() in ('owner', 'hr_admin', 'auditor') or employee_id = public.auth_employee_id())
  );
create policy onboarding_tasks_insert on public.onboarding_tasks for insert to authenticated
  with check (tenant_id = public.auth_tenant_id() and public.auth_role() in ('owner', 'hr_admin'));
create policy onboarding_tasks_update on public.onboarding_tasks for update to authenticated
  using (tenant_id = public.auth_tenant_id() and public.auth_role() in ('owner', 'hr_admin'))
  with check (tenant_id = public.auth_tenant_id());
create policy onboarding_tasks_delete on public.onboarding_tasks for delete to authenticated
  using (tenant_id = public.auth_tenant_id() and public.auth_role() in ('owner', 'hr_admin')
         and code is null);
revoke insert, update on public.onboarding_tasks from authenticated;
grant insert (employee_id, title, owner_role, due_date, sort_order) on public.onboarding_tasks to authenticated;
grant update (title, owner_role, due_date, done_at) on public.onboarding_tasks to authenticated;

-- Probation (HIR-07): the reviewee's manager (direct manager, or a manager whose branches
-- include them), owner and HR admin; the auditor reads. Staff never see reviews.
create or replace function public.can_review_probation(p_employee_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.employees e
    where e.id = p_employee_id
      and e.tenant_id = public.auth_tenant_id()
      and e.id is distinct from public.auth_employee_id()
      and (
        public.auth_role() in ('owner', 'hr_admin')
        or (public.auth_role() in ('manager', 'staff') and e.manager_id = public.auth_employee_id())
        or public.is_manager_of(e.id)
      )
  );
$$;
revoke execute on function public.can_review_probation(uuid) from public, anon;
grant execute on function public.can_review_probation(uuid) to authenticated;

create policy probation_reviews_select on public.probation_reviews for select to authenticated
  using (
    tenant_id = public.auth_tenant_id()
    and (public.auth_role() = 'auditor' or public.can_review_probation(employee_id))
  );
revoke insert, update, delete, truncate on public.probation_reviews from authenticated;

create policy probation_reminders_sent_select on public.probation_reminders_sent for select to authenticated
  using (tenant_id = public.auth_tenant_id() and public.auth_role() in ('owner', 'hr_admin'));
revoke insert, update, delete, truncate on public.probation_reminders_sent from authenticated;

-- ── Helpers ─────────────────────────────────────────────────────────────────────────────
-- Notifies the people who run hiring: active owners and HR admins with an account.
create or replace function public.notify_hiring_team(
  p_tenant_id uuid,
  p_template text,
  p_data jsonb,
  p_link text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_count integer := 0;
begin
  for v_user in
    select distinct m.user_id from public.memberships m
    where m.tenant_id = p_tenant_id and m.is_active and m.user_id is not null
      and m.role in ('owner', 'hr_admin')
  loop
    perform public.notify(v_user, p_template, p_data, p_link);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
revoke execute on function public.notify_hiring_team(uuid, text, jsonb, text) from public, anon, authenticated;

create or replace function public.sha256_hex(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(extensions.digest(p_value, 'sha256'), 'hex');
$$;
revoke execute on function public.sha256_hex(text) from public, anon, authenticated;

-- Company details for letters.
create or replace function public.letter_company(p_tenant_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'name', coalesce(t.trading_name, t.legal_name),
    'legal_name', t.legal_name,
    'reg_no', t.ssm_no,
    'address', t.address,
    'default_locale', t.default_locale
  )
  from public.tenants t where t.id = p_tenant_id;
$$;
revoke execute on function public.letter_company(uuid) from public, anon, authenticated;

create or replace function public.require_hiring_role()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if public.auth_role() is null or public.auth_role() not in ('owner', 'hr_admin') then
    raise exception 'Only the owner or HR admin can do this' using errcode = '42501';
  end if;
end;
$$;
revoke execute on function public.require_hiring_role() from public, anon, authenticated;

-- ── HIR-03 offer letters (called by the `hiring` Edge Function as the signed-in user) ───
-- Everything the letter needs, raw: the function formats dates and money per language.
create or replace function public.offer_letter_data(p_offer_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_offer public.offers;
  v_candidate public.candidates;
begin
  perform public.require_hiring_role();
  select * into v_offer from public.offers
  where id = p_offer_id and tenant_id = public.auth_tenant_id();
  if not found then
    raise exception 'Offer not found' using errcode = 'P0002';
  end if;
  select * into v_candidate from public.candidates where id = v_offer.candidate_id;
  return jsonb_build_object(
    'offer', to_jsonb(v_offer),
    'candidate', jsonb_build_object(
      'id', v_candidate.id, 'full_name', v_candidate.full_name, 'email', v_candidate.email,
      'stage', v_candidate.stage, 'converted_at', v_candidate.converted_at
    ),
    'company', public.letter_company(v_offer.tenant_id),
    'branch_name', (select b.name from public.branches b where b.id = v_offer.branch_id),
    'manager_name', (select e.full_name from public.employees e where e.id = v_offer.manager_id),
    'templates', (
      select jsonb_object_agg(t.kind, jsonb_build_object('title', t.title, 'body', t.body, 'is_draft', t.is_draft))
      from public.letter_templates t
      where t.tenant_id = v_offer.tenant_id and t.locale = v_offer.locale and t.kind in ('offer', 'contract')
    ),
    'folder', v_offer.tenant_id || '/offers/' || v_offer.id || '/'
  );
end;
$$;
revoke execute on function public.offer_letter_data(uuid) from public, anon;
grant execute on function public.offer_letter_data(uuid) to authenticated;

-- Settings > Letter templates preview: company details for the sample letter.
create or replace function public.letter_preview_data()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_hiring_role();
  return public.letter_company(public.auth_tenant_id());
end;
$$;
revoke execute on function public.letter_preview_data() from public, anon;
grant execute on function public.letter_preview_data() to authenticated;

-- The Edge Function has stored the letter PDF; this sends the offer: the candidate moves
-- to Offer and gets a new single-use link (only its hash is passed in). 14 days to accept.
create or replace function public.record_offer_sent(
  p_offer_id uuid,
  p_pdf_path text,
  p_sha256 text,
  p_token_hash text
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_offer public.offers;
  v_candidate public.candidates;
  v_expires timestamptz := now() + interval '14 days';
begin
  perform public.require_hiring_role();
  select * into v_offer from public.offers
  where id = p_offer_id and tenant_id = public.auth_tenant_id()
  for update;
  if not found then
    raise exception 'Offer not found' using errcode = 'P0002';
  end if;
  if v_offer.status <> 'draft' then
    raise exception 'This offer was already sent' using errcode = '22023', hint = 'offer_not_draft';
  end if;
  select * into v_candidate from public.candidates where id = v_offer.candidate_id for update;
  if v_candidate.stage not in ('applied', 'interview', 'offer') or v_candidate.offer_accepted_at is not null then
    raise exception 'This candidate cannot get an offer now' using errcode = '22023', hint = 'bad_stage';
  end if;
  if p_pdf_path is null or p_pdf_path not like v_offer.tenant_id || '/offers/' || v_offer.id || '/%'
     or not exists (select 1 from storage.objects o where o.bucket_id = 'letters' and o.name = p_pdf_path) then
    raise exception 'The letter was not stored' using errcode = '22023', hint = 'no_letter';
  end if;
  if p_sha256 !~ '^[0-9a-f]{64}$' or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Bad fingerprint' using errcode = '22023';
  end if;

  perform set_config('rakan.hiring_internal', 'on', true);
  update public.offers
  set status = 'sent', pdf_path = p_pdf_path, document_sha256 = p_sha256,
      sent_at = now(), expires_at = v_expires
  where id = v_offer.id;
  update public.candidates
  set stage = 'offer', offer_sent_at = now(),
      preboarding_token_hash = p_token_hash, preboarding_token_expires_at = v_expires,
      preboarding_token_used_at = null, preboarding_session_hash = null,
      preboarding_session_expires_at = null
  where id = v_candidate.id;
  perform set_config('rakan.hiring_internal', 'off', true);
  return v_expires;
end;
$$;
revoke execute on function public.record_offer_sent(uuid, text, text, text) from public, anon;
grant execute on function public.record_offer_sent(uuid, text, text, text) to authenticated;

-- "Resend link": a new single-use link (the old one stops working), 14 days again. An offer
-- not yet accepted gets the same extra time to accept.
create or replace function public.issue_preboarding_link(p_candidate_id uuid, p_token_hash text)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_candidate public.candidates;
  v_expires timestamptz := now() + interval '14 days';
begin
  perform public.require_hiring_role();
  select * into v_candidate from public.candidates
  where id = p_candidate_id and tenant_id = public.auth_tenant_id()
  for update;
  if not found then
    raise exception 'Candidate not found' using errcode = 'P0002';
  end if;
  if v_candidate.stage <> 'offer' or v_candidate.converted_at is not null
     or not exists (select 1 from public.offers o where o.candidate_id = v_candidate.id and o.status in ('sent', 'accepted')) then
    raise exception 'There is no open offer' using errcode = '22023', hint = 'no_open_offer';
  end if;
  if p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Bad token' using errcode = '22023';
  end if;
  perform set_config('rakan.hiring_internal', 'on', true);
  update public.offers set expires_at = v_expires
  where candidate_id = v_candidate.id and status = 'sent';
  perform set_config('rakan.hiring_internal', 'off', true);
  update public.candidates
  set preboarding_token_hash = p_token_hash, preboarding_token_expires_at = v_expires,
      preboarding_token_used_at = null
  where id = v_candidate.id;
  return v_expires;
end;
$$;
revoke execute on function public.issue_preboarding_link(uuid, text) from public, anon;
grant execute on function public.issue_preboarding_link(uuid, text) to authenticated;

-- Withdraw a draft or sent offer (to change it, or because the candidate declined).
create or replace function public.withdraw_offer(p_offer_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_offer public.offers;
begin
  perform public.require_hiring_role();
  select * into v_offer from public.offers
  where id = p_offer_id and tenant_id = public.auth_tenant_id()
  for update;
  if not found or v_offer.status not in ('draft', 'sent') then
    raise exception 'Only an offer that is not accepted can be withdrawn' using errcode = '22023',
      hint = 'offer_not_open';
  end if;
  perform set_config('rakan.hiring_internal', 'on', true);
  update public.offers set status = 'withdrawn' where id = v_offer.id;
  perform set_config('rakan.hiring_internal', 'off', true);
  update public.candidates
  set preboarding_token_hash = null, preboarding_session_hash = null
  where id = v_offer.candidate_id;
end;
$$;
revoke execute on function public.withdraw_offer(uuid) from public, anon;
grant execute on function public.withdraw_offer(uuid) to authenticated;

-- ── HIR-04 pre-boarding portal (no account: the session from the link) ─────────────────
create or replace function public.preboarding_candidate(p_session text)
returns public.candidates
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_candidate public.candidates;
begin
  if p_session is null or length(p_session) < 32 then
    raise exception 'This pre-boarding session has ended' using errcode = '42501', hint = 'session_invalid';
  end if;
  select * into v_candidate from public.candidates c
  where c.preboarding_session_hash = public.sha256_hex(p_session)
    and c.preboarding_session_expires_at > now()
    and c.stage = 'offer'
    and c.converted_at is null;
  if not found then
    raise exception 'This pre-boarding session has ended' using errcode = '42501', hint = 'session_invalid';
  end if;
  return v_candidate;
end;
$$;
revoke execute on function public.preboarding_candidate(text) from public, anon, authenticated;

-- The candidate's pre-boarding record, once the offer is signed.
create or replace function public.preboarding_employee(p_session text)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_candidate public.candidates := public.preboarding_candidate(p_session);
begin
  if v_candidate.employee_id is null or not exists (
    select 1 from public.employees e
    where e.id = v_candidate.employee_id and e.status = 'preboarding' and e.deleted_at is null
  ) then
    raise exception 'Accept the offer first' using errcode = '22023', hint = 'offer_not_accepted';
  end if;
  return v_candidate.employee_id;
end;
$$;
revoke execute on function public.preboarding_employee(text) from public, anon, authenticated;

-- Opening the emailed link: the link works once, and is exchanged for a session that lasts
-- until the start date (at least as long as the link would have).
create or replace function public.preboarding_redeem(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_candidate public.candidates;
  v_start date;
  v_session text;
  v_expires timestamptz;
begin
  select * into v_candidate from public.candidates c
  where c.preboarding_token_hash = public.sha256_hex(coalesce(p_token, ''))
  for update;
  if not found then
    raise exception 'This link is not valid' using errcode = 'P0002', hint = 'link_invalid';
  end if;
  if v_candidate.preboarding_token_used_at is not null then
    raise exception 'This link was already used' using errcode = '22023', hint = 'link_used';
  end if;
  if v_candidate.preboarding_token_expires_at <= now() then
    raise exception 'This link has expired' using errcode = '22023', hint = 'link_expired';
  end if;
  select o.start_date into v_start from public.offers o
  where o.candidate_id = v_candidate.id and o.status in ('sent', 'accepted');
  if v_candidate.stage <> 'offer' or v_candidate.converted_at is not null or v_start is null then
    raise exception 'This link is not valid' using errcode = 'P0002', hint = 'link_invalid';
  end if;

  v_session := encode(extensions.gen_random_bytes(32), 'hex');
  v_expires := greatest(
    v_candidate.preboarding_token_expires_at,
    ((v_start + 1)::timestamp at time zone 'Asia/Kuala_Lumpur')
  );
  update public.candidates
  set preboarding_token_used_at = now(),
      preboarding_session_hash = public.sha256_hex(v_session),
      preboarding_session_expires_at = v_expires
  where id = v_candidate.id;
  return jsonb_build_object('session', v_session, 'expires_at', v_expires);
end;
$$;

-- Everything the portal shows, in one call.
create or replace function public.preboarding_context(p_session text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_candidate public.candidates := public.preboarding_candidate(p_session);
  v_offer public.offers;
  v_role_id uuid;
  v_employee jsonb;
begin
  select * into v_offer from public.offers o
  where o.candidate_id = v_candidate.id and o.status in ('sent', 'accepted');
  v_role_id := coalesce(v_offer.job_role_id,
    (select j.job_role_id from public.job_openings j where j.id = v_candidate.job_opening_id));

  select jsonb_build_object(
    'id', e.id, 'full_name', e.full_name, 'id_type', e.id_type, 'id_no_last4', e.id_no_last4,
    'nationality', e.nationality, 'is_permanent_resident', e.is_permanent_resident,
    'date_of_birth', e.date_of_birth, 'gender', e.gender, 'marital_status', e.marital_status,
    'religion', e.religion, 'email', e.email, 'phone', e.phone, 'address', e.address,
    'emergency_contact', e.emergency_contact, 'epf_no', e.epf_no, 'socso_no', e.socso_no,
    'tax_no', e.tax_no, 'pcb_category', e.pcb_category,
    'children_count_eligible', e.children_count_eligible
  ) into v_employee
  from public.employees e
  where e.id = v_candidate.employee_id and e.status = 'preboarding' and e.deleted_at is null;

  return jsonb_build_object(
    'candidate', jsonb_build_object(
      'id', v_candidate.id, 'full_name', v_candidate.full_name, 'email', v_candidate.email,
      'submitted_at', v_candidate.preboarding_submitted_at
    ),
    'company', public.letter_company(v_candidate.tenant_id) - 'reg_no' - 'address',
    'offer', case when v_offer.id is null then null else jsonb_build_object(
      'id', v_offer.id, 'status', v_offer.status, 'locale', v_offer.locale,
      'job_title', v_offer.job_title, 'start_date', v_offer.start_date,
      'expires_at', v_offer.expires_at, 'accepted_at', v_offer.accepted_at,
      'signature_id', v_offer.signature_id, 'document_sha256', v_offer.document_sha256
    ) end,
    'employee', v_employee,
    'bank', (
      select jsonb_build_object('bank_code', a.bank_code, 'account_no_last4', a.account_no_last4,
                                'holder_name', a.holder_name)
      from public.bank_accounts a
      where a.employee_id = v_candidate.employee_id and a.is_primary
    ),
    'dependents', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', d.id, 'name', d.name, 'relationship', d.relationship,
        'date_of_birth', d.date_of_birth, 'is_disabled', d.is_disabled,
        'in_tertiary_education', d.in_tertiary_education) order by d.created_at)
      from public.dependents d where d.employee_id = v_candidate.employee_id
    ), '[]'::jsonb),
    'required', coalesce((
      select jsonb_agg(jsonb_build_object('credential_type_id', r.credential_type_id,
                                          'requirement', r.requirement) order by t.sort_order)
      from public.role_credential_requirements r
      join public.credential_types t on t.id = r.credential_type_id
      where r.job_role_id = v_role_id and t.is_active
    ), '[]'::jsonb),
    'types', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id, 'code', t.code, 'name_en', t.name_en, 'name_ms', t.name_ms,
        'category', t.category, 'issuing_body', t.issuing_body, 'has_expiry', t.has_expiry,
        'default_validity_months', t.default_validity_months,
        'reminder_offsets_days', t.reminder_offsets_days,
        'requires_verification', t.requires_verification, 'tracks_cpd', t.tracks_cpd,
        'cpd_points_required', t.cpd_points_required, 'cpd_cycle_months', t.cpd_cycle_months,
        'restricted', t.restricted, 'is_active', t.is_active, 'sort_order', t.sort_order
      ) order by t.sort_order)
      from public.credential_types t
      where t.tenant_id = v_candidate.tenant_id and t.is_active
    ), '[]'::jsonb),
    'credentials', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'employee_id', s.employee_id, 'credential_type_id', s.credential_type_id,
        'reference_no', s.reference_no, 'issuing_body', s.issuing_body,
        'effective_date', s.effective_date, 'expiry_date', s.expiry_date,
        'cpd_points', s.cpd_points, 'notes', s.notes, 'status', s.status,
        'previous_id', s.previous_id, 'submitted_by', s.submitted_by,
        'submitted_at', s.submitted_at, 'verified_at', s.verified_at,
        'verify_method', s.verify_method, 'reject_reason', s.reject_reason,
        'created_at', s.created_at,
        'file_count', (select count(*) from public.credential_files f where f.staff_credential_id = s.id)
      ) order by s.created_at)
      from public.staff_credentials s
      where s.employee_id = v_candidate.employee_id and s.status <> 'withdrawn'
    ), '[]'::jsonb),
    'banks', (
      select jsonb_agg(jsonb_build_object('code', b.code, 'name', b.name) order by b.name)
      from public.banks b where b.is_active
    )
  );
end;
$$;

-- What the Edge Function needs to stamp and store the candidate's signed copy.
create or replace function public.preboarding_offer_for_signing(p_session text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_candidate public.candidates := public.preboarding_candidate(p_session);
  v_offer public.offers;
begin
  select * into v_offer from public.offers o
  where o.candidate_id = v_candidate.id and o.status = 'sent';
  if not found or v_offer.expires_at <= now() then
    raise exception 'This offer is no longer open' using errcode = '22023', hint = 'offer_not_open';
  end if;
  return jsonb_build_object(
    'tenant_id', v_offer.tenant_id, 'offer_id', v_offer.id, 'pdf_path', v_offer.pdf_path,
    'document_sha256', v_offer.document_sha256, 'job_title', v_offer.job_title,
    'candidate_name', v_candidate.full_name, 'candidate_email', v_candidate.email,
    'company', public.letter_company(v_offer.tenant_id) ->> 'name'
  );
end;
$$;

-- A 5-minute link to the offer PDF is made by the Edge Function; this says which file.
create or replace function public.preboarding_offer_file(p_session text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_candidate public.candidates := public.preboarding_candidate(p_session);
begin
  return (
    select coalesce(s.signed_pdf_path, o.pdf_path)
    from public.offers o
    left join public.signatures s on s.id = o.signature_id
    where o.candidate_id = v_candidate.id and o.status in ('sent', 'accepted')
  );
end;
$$;

-- HIR-08: the candidate accepts by click-to-sign. The signed copy is already stored at
-- {tenant}/offer/{offer}/{signature}.pdf in `signed`. Accepting creates their employee
-- record with status 'preboarding', which the rest of the portal fills in.
create or replace function public.preboarding_accept_offer(
  p_session text,
  p_signature_id uuid,
  p_typed_name text,
  p_consent_text text,
  p_ip text,
  p_user_agent text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_candidate public.candidates := public.preboarding_candidate(p_session);
  v_offer public.offers;
  v_path text;
  v_employee_id uuid;
begin
  select * into v_offer from public.offers o
  where o.candidate_id = v_candidate.id and o.status = 'sent'
  for update;
  if not found or v_offer.expires_at <= now() then
    raise exception 'This offer is no longer open' using errcode = '22023', hint = 'offer_not_open';
  end if;
  if btrim(coalesce(p_typed_name, '')) = '' or not public.same_name(p_typed_name, v_candidate.full_name) then
    raise exception 'Type your full name exactly as in the offer' using errcode = '22023',
      hint = 'name_mismatch';
  end if;
  if btrim(coalesce(p_consent_text, '')) = '' then
    raise exception 'Consent is required' using errcode = '22023';
  end if;
  v_path := v_offer.tenant_id || '/offer/' || v_offer.id || '/' || p_signature_id || '.pdf';
  if not exists (select 1 from storage.objects o where o.bucket_id = 'signed' and o.name = v_path) then
    raise exception 'The signed copy was not stored' using errcode = '22023', hint = 'no_signed_pdf';
  end if;

  insert into public.employees (tenant_id, full_name, email, phone, status, job_role_id,
    job_title, branch_id, manager_id)
  values (v_offer.tenant_id, v_candidate.full_name, v_candidate.email, v_candidate.phone,
    'preboarding', v_offer.job_role_id, v_offer.job_title, v_offer.branch_id, v_offer.manager_id)
  returning id into v_employee_id;

  insert into public.signatures (id, tenant_id, entity_type, entity_id, signer_candidate_id,
    signer_employee_id, typed_name, consent_text, ip, user_agent, document_sha256, signed_pdf_path)
  values (p_signature_id, v_offer.tenant_id, 'offer', v_offer.id, v_candidate.id, v_employee_id,
    btrim(p_typed_name), p_consent_text, left(p_ip, 100), left(p_user_agent, 500),
    v_offer.document_sha256, v_path);

  perform set_config('rakan.hiring_internal', 'on', true);
  update public.offers
  set status = 'accepted', accepted_at = now(), signature_id = p_signature_id
  where id = v_offer.id;
  perform set_config('rakan.hiring_internal', 'off', true);
  update public.candidates
  set offer_accepted_at = now(), employee_id = v_employee_id
  where id = v_candidate.id;

  perform public.notify_hiring_team(v_offer.tenant_id, 'offer_accepted',
    jsonb_build_object('candidate_name', v_candidate.full_name, 'job_title', v_offer.job_title),
    '/admin/hiring/candidates/' || v_candidate.id);
  return v_employee_id;
exception
  when unique_violation then
    raise exception 'You have already signed this' using errcode = '23505', hint = 'already_signed';
end;
$$;

-- Personal details and emergency contact (EMP-01 fields). id_no: write-only, encrypted.
create or replace function public.preboarding_save_personal(p_session text, p_data jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_employee_id uuid := public.preboarding_employee(p_session);
begin
  update public.employees set
    full_name = p_data ->> 'full_name',
    id_type = (p_data ->> 'id_type')::public.id_type,
    id_no = nullif(p_data ->> 'id_no', ''),
    nationality = coalesce(p_data ->> 'nationality', 'MY'),
    is_permanent_resident = coalesce((p_data ->> 'is_permanent_resident')::boolean, false),
    date_of_birth = (p_data ->> 'date_of_birth')::date,
    gender = (p_data ->> 'gender')::public.gender,
    marital_status = (p_data ->> 'marital_status')::public.marital_status,
    religion = p_data ->> 'religion',
    email = p_data ->> 'email',
    phone = p_data ->> 'phone',
    address = p_data ->> 'address',
    emergency_contact = coalesce(p_data -> 'emergency_contact', '{}'::jsonb)
  where id = v_employee_id;
end;
$$;

-- Statutory numbers and tax category (EMP-04); EIS and zakat are left to HR.
create or replace function public.preboarding_save_statutory(p_session text, p_data jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_employee_id uuid := public.preboarding_employee(p_session);
begin
  update public.employees set
    epf_no = p_data ->> 'epf_no',
    socso_no = p_data ->> 'socso_no',
    tax_no = p_data ->> 'tax_no',
    pcb_category = (p_data ->> 'pcb_category')::public.pcb_category,
    spouse_working = (p_data ->> 'spouse_working')::boolean,
    children_count_eligible = coalesce((p_data ->> 'children_count_eligible')::integer, 0)
  where id = v_employee_id;
end;
$$;

-- Salary account (EMP-05). A new one replaces the old; HR checks it before the first payroll.
create or replace function public.preboarding_save_bank(
  p_session text,
  p_bank_code text,
  p_account_no text,
  p_holder_name text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_employee_id uuid := public.preboarding_employee(p_session);
begin
  insert into public.bank_accounts (employee_id, bank_code, account_no, holder_name, is_primary, status)
  values (v_employee_id, p_bank_code, p_account_no, p_holder_name, true, 'active');
end;
$$;

-- Dependents (PCB relief inputs): the list replaces what was there.
create or replace function public.preboarding_save_dependents(p_session text, p_items jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_employee_id uuid := public.preboarding_employee(p_session);
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 20 then
    raise exception 'Bad dependents list' using errcode = '22023';
  end if;
  delete from public.dependents where employee_id = v_employee_id;
  insert into public.dependents (employee_id, name, relationship, date_of_birth, is_disabled, in_tertiary_education)
  select v_employee_id, i ->> 'name', i ->> 'relationship', (i ->> 'date_of_birth')::date,
         coalesce((i ->> 'is_disabled')::boolean, false),
         coalesce((i ->> 'in_tertiary_education')::boolean, false)
  from jsonb_array_elements(p_items) i;
end;
$$;

-- Credentials (CRD-05 via the portal): a draft, its files through upload-credential-file,
-- then submit → Pending for HR to verify (no approval request: HR verifies from the queue).
create or replace function public.preboarding_save_credential(
  p_session text,
  p_credential_id uuid,
  p_data jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_employee_id uuid := public.preboarding_employee(p_session);
  v_id uuid;
begin
  if p_credential_id is null then
    insert into public.staff_credentials (employee_id, credential_type_id, reference_no,
      issuing_body, effective_date, expiry_date, cpd_points, notes, status, submitted_by)
    values (v_employee_id, (p_data ->> 'credential_type_id')::uuid, p_data ->> 'reference_no',
      p_data ->> 'issuing_body', (p_data ->> 'effective_date')::date,
      (p_data ->> 'expiry_date')::date, (p_data ->> 'cpd_points')::numeric,
      p_data ->> 'notes', 'draft', null)
    returning id into v_id;
    return v_id;
  end if;
  update public.staff_credentials set
    reference_no = p_data ->> 'reference_no',
    issuing_body = p_data ->> 'issuing_body',
    effective_date = (p_data ->> 'effective_date')::date,
    expiry_date = (p_data ->> 'expiry_date')::date,
    cpd_points = (p_data ->> 'cpd_points')::numeric,
    notes = p_data ->> 'notes'
  where id = p_credential_id and employee_id = v_employee_id and status in ('draft', 'pending')
  returning id into v_id;
  if v_id is null then
    raise exception 'Credential not found' using errcode = 'P0002';
  end if;
  return v_id;
end;
$$;

create or replace function public.preboarding_credential_upload_target(
  p_session text,
  p_credential_id uuid
)
returns table (tenant_id uuid, employee_id uuid, folder text, allowed_mime text[], next_page integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_employee_id uuid := public.preboarding_employee(p_session);
  v_cred public.staff_credentials;
  v_count integer;
begin
  select * into v_cred from public.staff_credentials s
  where s.id = p_credential_id and s.employee_id = v_employee_id and s.status in ('draft', 'pending');
  if not found then
    raise exception 'Credential not found' using errcode = 'P0002';
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

create or replace function public.preboarding_submit_credential(p_session text, p_credential_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_employee_id uuid := public.preboarding_employee(p_session);
  v_cred public.staff_credentials;
  v_type public.credential_types;
begin
  select * into v_cred from public.staff_credentials s
  where s.id = p_credential_id and s.employee_id = v_employee_id
  for update;
  if not found then
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
  update public.staff_credentials set status = 'pending', submitted_at = now() where id = v_cred.id;
  return 'pending';
exception
  when unique_violation then
    raise exception 'This credential is already waiting for HR' using errcode = '23505',
      hint = 'pending_exists';
end;
$$;

create or replace function public.preboarding_withdraw_credential(p_session text, p_credential_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_employee_id uuid := public.preboarding_employee(p_session);
begin
  update public.staff_credentials set status = 'withdrawn'
  where id = p_credential_id and employee_id = v_employee_id and status in ('draft', 'pending');
  if not found then
    raise exception 'Credential not found' using errcode = 'P0002';
  end if;
end;
$$;

-- "I'm done": tells HR the details are in (they can still be changed until conversion).
create or replace function public.preboarding_submit(p_session text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_candidate public.candidates := public.preboarding_candidate(p_session);
  v_employee_id uuid := public.preboarding_employee(p_session);
begin
  update public.candidates set preboarding_submitted_at = now() where id = v_candidate.id;
  perform public.notify_hiring_team(v_candidate.tenant_id, 'preboarding_completed',
    jsonb_build_object('candidate_name', v_candidate.full_name, 'employee_id', v_employee_id),
    '/admin/hiring/candidates/' || v_candidate.id);
end;
$$;

do $$
declare
  v_fn text;
begin
  foreach v_fn in array array[
    'public.preboarding_redeem(text)',
    'public.preboarding_context(text)',
    'public.preboarding_offer_for_signing(text)',
    'public.preboarding_offer_file(text)',
    'public.preboarding_accept_offer(text, uuid, text, text, text, text)',
    'public.preboarding_save_personal(text, jsonb)',
    'public.preboarding_save_statutory(text, jsonb)',
    'public.preboarding_save_bank(text, text, text, text)',
    'public.preboarding_save_dependents(text, jsonb)',
    'public.preboarding_save_credential(text, uuid, jsonb)',
    'public.preboarding_credential_upload_target(text, uuid)',
    'public.preboarding_submit_credential(text, uuid)',
    'public.preboarding_withdraw_credential(text, uuid)',
    'public.preboarding_submit(text)'
  ] loop
    execute format('revoke execute on function %s from public', v_fn);
    execute format('grant execute on function %s to anon, authenticated', v_fn);
  end loop;
end;
$$;

-- ── HIR-05 / HIR-06 Convert to employee ─────────────────────────────────────────────────
-- Default onboarding checklist, due dates counted from the start date. The app shows the
-- titles in the reader's language by code; title is the English fallback.
create or replace function public.create_onboarding_tasks(p_employee_id uuid, p_start date)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.onboarding_tasks (employee_id, code, title, owner_role, due_date, sort_order, created_by)
  select p_employee_id, v.code, v.title, v.owner_role::public.app_role, p_start + v.days, v.sort_order, auth.uid()
  from (values
    ('SYSTEM_ACCOUNTS', 'Set up system accounts (Rakan, email)', 'hr_admin', -1, 10),
    ('ORIENTATION', 'Orientation and centre walk-through', 'manager', 0, 20),
    ('UNIFORM', 'Issue uniform and name tag', 'hr_admin', 0, 30),
    ('CREDENTIALS_VERIFIED', 'Credential verification complete', 'hr_admin', 0, 40),
    ('POLICIES_SIGNED', 'Privacy notice and handbook signed in Rakan', 'staff', 3, 50),
    ('PAYROLL_DETAILS', 'Check bank and statutory details for payroll', 'hr_admin', 7, 60),
    ('EPF_REGISTRATION', 'Register with KWSP (EPF)', 'hr_admin', 7, 70),
    ('SOCSO_REGISTRATION', 'Register with PERKESO (SOCSO and EIS)', 'hr_admin', 30, 80)
  ) as v (code, title, owner_role, days, sort_order)
  on conflict (employee_id, code) do nothing;
$$;
revoke execute on function public.create_onboarding_tasks(uuid, date) from public, anon, authenticated;

create or replace function public.convert_candidate(p_candidate_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_candidate public.candidates;
  v_offer public.offers;
  v_employee public.employees;
  v_draft record;
  v_invited boolean := false;
  v_first boolean;
begin
  perform public.require_hiring_role();
  select * into v_candidate from public.candidates
  where id = p_candidate_id and tenant_id = public.auth_tenant_id()
  for update;
  if not found then
    raise exception 'Candidate not found' using errcode = 'P0002';
  end if;
  if v_candidate.converted_at is not null then
    raise exception 'Already converted' using errcode = '22023', hint = 'already_converted';
  end if;
  select * into v_offer from public.offers where candidate_id = v_candidate.id and status = 'accepted';
  select * into v_employee from public.employees
  where id = v_candidate.employee_id and status = 'preboarding' and deleted_at is null
  for update;
  if v_offer.id is null or v_employee.id is null then
    raise exception 'The offer has not been accepted' using errcode = '22023', hint = 'offer_not_accepted';
  end if;

  -- Contract history starts with the accepted offer's terms.
  insert into public.employment_records (employee_id, employment_type, pay_model, basic_salary,
    hourly_rate, session_rate, normal_hours_per_day, work_days_per_week, start_date, end_date,
    probation_end, is_current)
  values (v_employee.id, v_offer.employment_type, v_offer.pay_model, v_offer.basic_salary,
    v_offer.hourly_rate, v_offer.session_rate, v_offer.normal_hours_per_day,
    v_offer.work_days_per_week, v_offer.start_date, v_offer.contract_end_date,
    case when v_offer.probation_months > 0
      then (v_offer.start_date + make_interval(months => v_offer.probation_months) - interval '1 day')::date
    end,
    true);

  update public.employees set status = 'active' where id = v_employee.id;

  -- Credentials: uploads left in draft are sent to HR as Pending (one per type).
  for v_draft in
    select s.id from public.staff_credentials s
    where s.employee_id = v_employee.id and s.status = 'draft'
      and exists (select 1 from public.credential_files f where f.staff_credential_id = s.id)
      and not exists (
        select 1 from public.staff_credentials p
        where p.employee_id = s.employee_id and p.credential_type_id = s.credential_type_id
          and p.status = 'pending'
      )
    order by s.created_at desc
  loop
    begin
      update public.staff_credentials set status = 'pending', submitted_at = now()
      where id = v_draft.id;
    exception when unique_violation then
      null; -- a newer draft of the same type went first
    end;
  end loop;

  -- Leave balances: created for every active employee by the leave module (Step 9).

  perform public.create_onboarding_tasks(v_employee.id, v_offer.start_date);

  -- A Rakan account (staff) through the usual invite email, unless the address is taken.
  if not exists (
    select 1 from public.memberships m
    where m.tenant_id = v_candidate.tenant_id
      and (m.invited_email = v_candidate.email or m.employee_id = v_employee.id)
  ) then
    insert into public.memberships (tenant_id, invited_email, role, employee_id)
    values (v_candidate.tenant_id, v_candidate.email, 'staff', v_employee.id);
    v_invited := true;
  end if;

  -- ORG-04: the first hire sets the date the setup checklist counts from.
  v_first := not exists (
    select 1 from public.candidates c
    where c.tenant_id = v_candidate.tenant_id and c.converted_at is not null
  );
  if v_first then
    update public.tenants set first_hire_date = v_offer.start_date where id = v_candidate.tenant_id;
  end if;

  perform set_config('rakan.hiring_internal', 'on', true);
  update public.candidates
  set stage = 'hired', converted_at = now(),
      preboarding_token_hash = null, preboarding_session_hash = null
  where id = v_candidate.id;
  perform set_config('rakan.hiring_internal', 'off', true);

  return jsonb_build_object('employee_id', v_employee.id, 'invited', v_invited, 'first_hire', v_first);
end;
$$;
revoke execute on function public.convert_candidate(uuid) from public, anon;
grant execute on function public.convert_candidate(uuid) to authenticated;

-- ── HIR-07 probation ────────────────────────────────────────────────────────────────────
create or replace function public.hiring_function_url()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select replace(decrypted_secret, '/send-notification-email', '/hiring')
  from vault.decrypted_secrets where name = 'notify_function_url';
$$;
revoke execute on function public.hiring_function_url() from public, anon, authenticated;

-- Asks the `hiring` Edge Function to write the confirmation / extension letter (pg_net,
-- after commit). Without the Vault secrets the decision still stands; HR can retry.
create or replace function public.queue_probation_letter(p_review_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text := public.hiring_function_url();
  v_secret text;
begin
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'notify_webhook_secret';
  if v_url is null or v_secret is null then
    update public.probation_reviews set letter_error = 'Email and letter service not set up'
    where id = p_review_id;
    return;
  end if;
  perform net.http_post(
    url := v_url,
    body := jsonb_build_object('action', 'probation_letter', 'review_id', p_review_id),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', v_secret)
  );
end;
$$;
revoke execute on function public.queue_probation_letter(uuid) from public, anon, authenticated;

-- Applies an approved review: confirm sets confirmed_on (the probation end date); extend
-- moves the probation end; end leaves the record for HR to give notice.
create or replace function public.apply_probation_decision(p_review_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_review public.probation_reviews;
  v_record public.employment_records;
  v_date date;
  v_name text;
begin
  select * into v_review from public.probation_reviews where id = p_review_id for update;
  select * into v_record from public.employment_records where id = v_review.employment_record_id for update;
  select full_name into v_name from public.employees where id = v_review.employee_id;

  update public.probation_reviews set status = 'approved', decided_at = now() where id = v_review.id;
  if v_review.recommendation = 'confirm' then
    v_date := coalesce(v_record.probation_end, public.malaysia_today());
    update public.employment_records set confirmed_on = v_date where id = v_record.id;
    update public.probation_reviews set confirmed_on = v_date where id = v_review.id;
    perform public.queue_probation_letter(v_review.id);
  elsif v_review.recommendation = 'extend' then
    v_date := (coalesce(v_record.probation_end, public.malaysia_today())
               + make_interval(months => v_review.extend_months))::date;
    update public.employment_records set probation_end = v_date where id = v_record.id;
    update public.probation_reviews set new_probation_end = v_date where id = v_review.id;
    perform public.queue_probation_letter(v_review.id);
  else
    perform public.notify_hiring_team(v_review.tenant_id, 'probation_end_approved',
      jsonb_build_object('employee_name', v_name, 'employee_id', v_review.employee_id),
      '/admin/people/' || v_review.employee_id || '?tab=probation');
  end if;
end;
$$;
revoke execute on function public.apply_probation_decision(uuid) from public, anon, authenticated;

-- The manager (or HR) submits the review; the Owner approves it. A review by an Owner
-- needs nobody else's approval.
create or replace function public.submit_probation_review(
  p_employee_id uuid,
  p_ratings jsonb,
  p_comments text,
  p_recommendation text,
  p_extend_months integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_record public.employment_records;
  v_id uuid;
  v_approval_id uuid;
begin
  if not public.can_review_probation(p_employee_id) then
    raise exception 'You cannot review this person' using errcode = '42501';
  end if;
  select * into v_record from public.employment_records r
  where r.employee_id = p_employee_id and r.is_current
    and r.probation_end is not null and r.confirmed_on is null;
  if not found then
    raise exception 'This person is not on probation' using errcode = '22023', hint = 'no_probation';
  end if;

  insert into public.probation_reviews (employee_id, employment_record_id, due_date, ratings,
    comments, recommendation, extend_months)
  values (p_employee_id, v_record.id, v_record.probation_end, p_ratings, btrim(p_comments),
    p_recommendation, case when p_recommendation = 'extend' then p_extend_months end)
  returning id into v_id;

  if public.auth_role() = 'owner' then
    perform public.apply_probation_decision(v_id);
  else
    v_approval_id := public.create_approval('probation_review', v_id,
      jsonb_build_array(jsonb_build_object('role', 'owner')));
    update public.probation_reviews set approval_id = v_approval_id where id = v_id;
  end if;
  return v_id;
exception
  when unique_violation then
    raise exception 'A review is already waiting for approval' using errcode = '23505',
      hint = 'review_open';
end;
$$;
revoke execute on function public.submit_probation_review(uuid, jsonb, text, text, integer) from public, anon;
grant execute on function public.submit_probation_review(uuid, jsonb, text, text, integer) to authenticated;

create or replace function public.probation_on_approval_decided()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.probation_reviews
    where id = new.entity_id and approval_id = new.id and status = 'submitted'
  ) then
    return null;
  end if;
  if new.status = 'approved' then
    perform public.apply_probation_decision(new.entity_id);
  else
    update public.probation_reviews
    set status = case when new.status = 'rejected' then 'rejected' else 'cancelled' end,
        decided_at = now()
    where id = new.entity_id;
  end if;
  return null;
end;
$$;
create trigger approvals_probation_decided
  after update of status on public.approvals
  for each row
  when (new.entity_type = 'probation_review' and old.status = 'pending' and new.status <> 'pending')
  execute function public.probation_on_approval_decided();

-- HR retries a letter that failed (e.g. before the email service was set up).
create or replace function public.retry_probation_letter(p_review_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_hiring_role();
  update public.probation_reviews set letter_error = null
  where id = p_review_id and tenant_id = public.auth_tenant_id()
    and status = 'approved' and recommendation in ('confirm', 'extend') and letter_path is null;
  if not found then
    raise exception 'Nothing to retry' using errcode = 'P0002';
  end if;
  perform public.queue_probation_letter(p_review_id);
end;
$$;
revoke execute on function public.retry_probation_letter(uuid) from public, anon;
grant execute on function public.retry_probation_letter(uuid) to authenticated;

-- For the Edge Function (service role only): what the letter says.
create or replace function public.probation_letter_data(p_review_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'review', jsonb_build_object(
      'id', r.id, 'recommendation', r.recommendation, 'extend_months', r.extend_months,
      'confirmed_on', r.confirmed_on, 'new_probation_end', r.new_probation_end,
      'decided_at', r.decided_at, 'status', r.status, 'letter_path', r.letter_path
    ),
    'employee', jsonb_build_object(
      'id', e.id, 'full_name', e.full_name,
      'job_title', coalesce(e.job_title, (select j.name from public.job_roles j where j.id = e.job_role_id))
    ),
    'company', public.letter_company(r.tenant_id),
    'template', (
      select jsonb_build_object('title', t.title, 'body', t.body, 'is_draft', t.is_draft, 'locale', t.locale)
      from public.letter_templates t
      where t.tenant_id = r.tenant_id
        and t.kind = case r.recommendation when 'confirm' then 'confirmation' else 'extension' end
        and t.locale = (select tn.default_locale from public.tenants tn where tn.id = r.tenant_id)
    ),
    'folder', r.tenant_id || '/' || r.employee_id || '/probation_letter/'
  )
  from public.probation_reviews r
  join public.employees e on e.id = r.employee_id
  where r.id = p_review_id;
$$;
revoke execute on function public.probation_letter_data(uuid) from public, anon, authenticated;
grant execute on function public.probation_letter_data(uuid) to service_role;

-- For the Edge Function (service role only): the letter is stored (or failed). Files it
-- with the employee's documents and tells the employee and their manager.
create or replace function public.probation_letter_stored(p_review_id uuid, p_path text, p_error text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_review public.probation_reviews;
  v_employee public.employees;
  v_user uuid;
begin
  select * into v_review from public.probation_reviews where id = p_review_id for update;
  if not found then
    return;
  end if;
  if p_error is not null then
    update public.probation_reviews set letter_error = left(p_error, 500) where id = v_review.id;
    return;
  end if;
  if v_review.letter_path is not null then
    return;
  end if;
  select * into v_employee from public.employees where id = v_review.employee_id;
  update public.probation_reviews set letter_path = p_path, letter_error = null where id = v_review.id;
  insert into public.documents (employee_id, doc_type, title, file_path, mime, uploaded_by, created_by)
  values (v_review.employee_id, 'probation_letter',
    case v_review.recommendation when 'confirm' then 'Confirmation letter' else 'Probation extension letter' end,
    p_path, 'application/pdf', null, null);

  for v_user in
    select m.user_id from public.memberships m
    where m.is_active and m.user_id is not null
      and (m.employee_id = v_employee.id or (v_employee.manager_id is not null and m.employee_id = v_employee.manager_id))
  loop
    perform public.notify(v_user, 'probation_decided',
      jsonb_build_object('employee_name', v_employee.full_name,
        'outcome', v_review.recommendation,
        'date', coalesce(v_review.confirmed_on, v_review.new_probation_end),
        'for_employee', exists (select 1 from public.memberships m2
                                where m2.user_id = v_user and m2.employee_id = v_employee.id)),
      '/staff/me');
  end loop;
end;
$$;
revoke execute on function public.probation_letter_stored(uuid, text, text) from public, anon, authenticated;
grant execute on function public.probation_letter_stored(uuid, text, text) to service_role;

-- HIR-07 reminders, daily 07:00 MYT: the manager hears 30, 14 and 7 days before probation
-- ends (the HR team when nobody manages the person). Like credential reminders, one is sent
-- for the nearest offset crossed and none is ever repeated; a submitted review stops them.
-- Takes "today" so tests can simulate a date.
create or replace function public.probation_reminders(p_today date default public.malaysia_today())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row record;
  v_offset integer;
  v_user record;
  v_recipients integer;
  v_sent integer := 0;
begin
  for v_row in
    select e.id as employee_id, e.tenant_id, e.full_name, e.manager_id, r.id as record_id,
           r.probation_end, r.probation_end - p_today as days_left
    from public.employment_records r
    join public.employees e on e.id = r.employee_id
    where r.is_current and r.probation_end is not null and r.confirmed_on is null
      and e.deleted_at is null and e.status in ('active', 'on_notice')
      and r.probation_end - p_today between 0 and 30
      and not exists (
        select 1 from public.probation_reviews pr
        where pr.employment_record_id = r.id and pr.due_date = r.probation_end
          and pr.status in ('submitted', 'approved')
      )
  loop
    select min(o) into v_offset from unnest(array[30, 14, 7]) o where o >= v_row.days_left;
    if v_offset is null or exists (
      select 1 from public.probation_reminders_sent s
      where s.employee_id = v_row.employee_id and s.probation_end = v_row.probation_end
        and s.days_before = v_offset
    ) then
      continue;
    end if;

    v_recipients := 0;
    for v_user in
      select m.user_id, m.role from public.memberships m
      where m.employee_id = v_row.manager_id and m.is_active and m.user_id is not null
    loop
      perform public.notify(v_user.user_id, 'probation_due',
        jsonb_build_object('employee_name', v_row.full_name, 'days_left', v_row.days_left,
                           'end_date', v_row.probation_end),
        case when public.home_area(v_user.role) = '/admin'
          then '/admin/people/' || v_row.employee_id || '?tab=probation'
          else '/staff/probation/' || v_row.employee_id end);
      v_recipients := v_recipients + 1;
    end loop;
    if v_recipients = 0 then
      perform public.notify_hiring_team(v_row.tenant_id, 'probation_due',
        jsonb_build_object('employee_name', v_row.full_name, 'days_left', v_row.days_left,
                           'end_date', v_row.probation_end),
        '/admin/people/' || v_row.employee_id || '?tab=probation');
    end if;

    insert into public.probation_reminders_sent (tenant_id, employee_id, probation_end, days_before)
    select v_row.tenant_id, v_row.employee_id, v_row.probation_end, o
    from unnest(array[30, 14, 7]) o where o >= v_offset
    on conflict do nothing;
    v_sent := v_sent + 1;
  end loop;
  return v_sent;
end;
$$;
revoke execute on function public.probation_reminders(date) from public, anon, authenticated;

-- 07:00 MYT = 23:00 UTC.
select cron.schedule('probation_reminders', '0 23 * * *', 'select public.probation_reminders()');

-- ── Storage (data-model.md §6) ──────────────────────────────────────────────────────────
-- candidates: {tenant_id}/{candidate_id}/{file} · CVs; owner / HR upload and read, auditor reads.
-- letters:    {tenant_id}/offers/{offer_id}/{file}.pdf · written only by the `hiring` Edge
--             Function (service role); owner / HR / auditor read.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('candidates', 'candidates', false, 10485760, array[
    'application/pdf', 'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]),
  ('letters', 'letters', false, 20971520, array['application/pdf'])
on conflict (id) do nothing;

create policy candidates_files_select on storage.objects for select to authenticated
  using (
    bucket_id = 'candidates'
    and (storage.foldername(name))[1] = public.auth_tenant_id()::text
    and public.auth_role() in ('owner', 'hr_admin', 'auditor')
  );
create policy candidates_files_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'candidates'
    and (storage.foldername(name))[1] = public.auth_tenant_id()::text
    and public.auth_role() in ('owner', 'hr_admin')
  );
create policy candidates_files_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'candidates'
    and (storage.foldername(name))[1] = public.auth_tenant_id()::text
    and public.auth_role() in ('owner', 'hr_admin')
  );

create policy letters_files_select on storage.objects for select to authenticated
  using (
    bucket_id = 'letters'
    and (storage.foldername(name))[1] = public.auth_tenant_id()::text
    and public.auth_role() in ('owner', 'hr_admin', 'auditor')
  );
