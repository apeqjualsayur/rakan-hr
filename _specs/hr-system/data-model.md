# HR Management System — Data Model (Supabase / Postgres)

Version: 0.1 (draft) · Date: 29 Oct 2026
Companion to `PRD.md`. Requirement IDs (e.g. CRD-05) refer to the PRD.

---

## 1. Conventions

- Every business table has: `id uuid pk default gen_random_uuid()`, `tenant_id uuid not null references tenants`, `created_at`, `updated_at`, `created_by uuid`.
- Soft delete via `deleted_at timestamptz` on records that fall under the 6-year retention rule (employees, payroll, attendance, leave). Never hard-delete those.
- Money stored as `numeric(12,2)` in RM. Never use float.
- Dates as `date`; event times as `timestamptz` (display in Asia/Kuala_Lumpur).
- Enums as Postgres `enum` types (listed in §4) or `text` + check constraint if likely to change.
- All tables have RLS enabled. Policies use helper functions (§5).
- Audit trigger on all tables marked 🔒.

---

## 2. Entity overview

```
tenants ─┬─ branches
         ├─ memberships (user × tenant × role)
         ├─ employees ─┬─ employment_records (contract history)
         │             ├─ dependents
         │             ├─ bank_accounts
         │             ├─ documents
         │             ├─ staff_credentials ── credential_files
         │             │        └─ credential_verifications
         │             ├─ leave_balances / leave_requests
         │             ├─ attendance_logs / roster_shifts / ot_requests
         │             ├─ claims ── claim_receipts
         │             └─ payslips ── payslip_lines
         ├─ job_roles ── role_credential_requirements ── credential_types
         ├─ job_openings ── candidates
         ├─ leave_types / leave_policies / public_holidays
         ├─ pay_items / payroll_runs
         ├─ approvals ── approval_steps
         ├─ compliance_alerts / setup_checklist_items
         └─ audit_log
Global (no tenant): statutory_rate_versions, epf_rate_bands, socso_rate_bands,
                    eis_rate_bands, pcb_parameters, minimum_wage_rates
```

---

## 3. Tables

### 3.1 Platform & organisation

**tenants**
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| legal_name | text | |
| ssm_no | text | |
| state_code | text | drives public holidays |
| is_msme | bool | drives minimum wage rule |
| epf_employer_no | text | |
| socso_employer_code | text | |
| lhdn_e_no | text | |
| hrdcorp_no | text | nullable |
| credential_enforcement | enum `enforcement_mode` | soft / hard (CRD-14) |
| default_locale | text | `en` / `ms` |

**banks** (global reference) — `code` (e.g. `MBB`, `CIMB`, `PBB`, `RHB`, `BIMB`, `HLB`, `AMB`), `name`, `swift_bic`, `ibg_code`, `is_active`. Used by both company and employee bank accounts.

**bank_file_formats** (global reference) — `code` (e.g. `MBB_M2U_BIZ`, `CIMB_BIZCHANNEL`, `GENERIC_CSV`), `bank_code` (null for generic), `version`, `adapter_key` (name of the Edge Function adapter), `column_mapping jsonb` (for generic CSV), `is_active`. New bank = new row + new adapter; no schema change.

**company_bank_accounts** 🔒 (PAY-10) — `tenant_id`, `bank_code → banks`, `account_name`, `account_no` (encrypted), `corporate_id` / `org_code` (bank-assigned IDs needed in file headers), `bank_file_format_code → bank_file_formats`, `is_default` (partial unique index: one default per tenant), `active_from`, `retired_at`. Never hard-deleted; retired accounts stay for history.

**branches** — `tenant_id`, name, address, `geo_lat`, `geo_lng`, `geo_radius_m`, `operating_hours jsonb`, `state_code`.

**memberships** 🔒 — `user_id → auth.users`, `tenant_id`, `role enum app_role`, `employee_id` (nullable link to own employee record), `branch_ids uuid[]` (manager scope), `is_active`.

**setup_checklist_items** (ORG-04) — `tenant_id`, `code` (e.g. `EPF_REGISTRATION`), title, `due_rule` (e.g. "7 days after first hire"), `due_date`, `status enum checklist_status`, `evidence_file_path`, `completed_at`, `completed_by`.

### 3.2 People

**employees** 🔒
| column | type | notes |
|---|---|---|
| employee_no | text | unique per tenant |
| full_name | text | as in MyKad / passport |
| id_type | enum `id_type` | mykad / passport |
| id_no | text | encrypted at rest (pgsodium / Vault) |
| nationality | text | |
| is_permanent_resident | bool | |
| date_of_birth | date | derived from MyKad when possible |
| gender | enum | |
| marital_status | enum | |
| pcb_category | enum `pcb_category` | |
| spouse_working | bool | |
| children_count_eligible | int | for PCB reliefs |
| email, phone, address | text | |
| emergency_contact | jsonb | |
| epf_no, socso_no, tax_no | text | |
| eis_eligible | bool | computed default, overridable |
| zakat_monthly | numeric | nullable |
| status | enum `employee_status` | preboarding / active / on_notice / left |
| branch_id, manager_id | uuid | |
| job_role_id | uuid | links to credential requirements |
| user_id | uuid | nullable until account created |

**employment_records** 🔒 — contract history: `employee_id`, `employment_type enum`, `pay_model enum pay_model`, `basic_salary`, `hourly_rate`, `session_rate`, `normal_hours_per_day`, `work_days_per_week`, `start_date`, `end_date`, `probation_end`, `confirmed_on`, `is_current`.

**dependents** — `employee_id`, name, relationship, DOB, `is_disabled`, `in_tertiary_education` (PCB child relief inputs).

**bank_accounts** 🔒 — `employee_id`, `bank_code → banks`, account_no (encrypted), holder_name, `is_primary`, `verified_by`, `verified_at`. Any bank; the payment file decides same-bank vs interbank (IBG / DuitNow) per line.

**documents** — `employee_id`, `doc_type`, `file_path` (storage), `expiry_date` nullable, `uploaded_by`.

**profile_change_requests** (EMP-07) — `employee_id`, `field`, `old_value`, `new_value`, `status`, `approval_id`.

### 3.3 Credentials & licences ⭐ (CRD-01 → CRD-16)

**credential_types**
| column | type | notes |
|---|---|---|
| tenant_id | uuid | nullable = global default seeded by system |
| code | text | e.g. `MAHPC_REG`, `APC`, `BLS`, `HEPB_VAX`, `SAFEGUARDING` |
| name_en / name_ms | text | |
| category | enum `credential_category` | registration / practising_cert / clinical_cert / vaccination / safeguarding / other |
| issuing_body | text | default issuer |
| has_expiry | bool | |
| default_validity_months | int | nullable |
| reminder_offsets_days | int[] | default `{90,60,30,7}` |
| requires_verification | bool | default true |
| allowed_mime | text[] | default pdf/jpeg/png |
| tracks_cpd | bool | |

**job_roles** — `tenant_id`, name (e.g. Speech-Language Therapist), `is_clinical`.

**role_credential_requirements** — `job_role_id`, `credential_type_id`, `requirement enum` (mandatory / optional), `blocks_roster bool`.

**staff_credentials** 🔒
| column | type | notes |
|---|---|---|
| employee_id | uuid | (or `candidate_id` during pre-boarding) |
| credential_type_id | uuid | |
| reference_no | text | registration / certificate no. |
| issuing_body | text | |
| effective_date | date | **required** |
| expiry_date | date | required when type `has_expiry`; check `expiry_date > effective_date` |
| cpd_points | numeric | nullable |
| notes | text | |
| status | enum `credential_status` | draft / pending / verified / rejected / superseded / withdrawn |
| previous_id | uuid | self-FK → the record this renews (CRD-07) |
| submitted_by | uuid | staff or HR |
| submitted_at | timestamptz | |

Derived (view, not stored): `validity_state` = upcoming / valid / expiring_soon / expired / missing — computed from `status = 'verified'`, today's date, `effective_date`, `expiry_date` and the type's first reminder offset.

Constraints:
- Partial unique index: only one `pending` record per (`employee_id`, `credential_type_id`).
- Staff may `update` only while `status = 'pending'` and `submitted_by = auth.uid()` (RLS).

**credential_files** — `staff_credential_id`, `file_path` (bucket `credentials`), `mime`, `size_bytes`, `page_no`, `uploaded_at`.

**credential_verifications** 🔒 — `staff_credential_id`, `action` (verified / rejected), `method` (e.g. "MAHPC online register", "original sighted"), `reason` (required on reject), `verified_by`, `verified_at`.

**credential_reminders_sent** — `staff_credential_id`, `offset_days`, `channel`, `sent_at` (prevents duplicate reminders).

**CPD (CRD-17 → CRD-19)**
- `credential_types` gains: `cpd_points_required numeric` (per cycle, nullable), `cpd_cycle_months int` (nullable), `restricted bool` (true for vaccination / health records → staff + HR only).
- **cpd_activities** 🔒 — `employee_id`, `credential_type_id` (the registration it counts toward), `title`, `provider`, `activity_date`, `points numeric`, `hours numeric`, `category`, `file_path` (bucket `credentials`), `status` (pending / verified / rejected), `verified_by`, `verified_at`, `reject_reason`.
- **v_cpd_progress** (view) — per employee × credential type: cycle start/end (from the current verified credential), points verified in cycle, points required, pro-rated target to date, `on_track bool`.

**v_credential_compliance** (view) — per employee: mandatory_total, mandatory_valid, compliance_pct, next_expiry_date. Used by the Compliance Centre and roster checks.

### 3.4 Hiring & onboarding

**job_openings** — `job_role_id`, title, `employment_type`, `pay_model`, `salary_min`, `salary_max`, status.

**candidates** — `job_opening_id`, name, email, phone, `cv_path`, `stage enum candidate_stage`, `offer_sent_at`, `offer_accepted_at`, `preboarding_token` (hashed, expiring), `converted_employee_id`.

**letter_templates** — `tenant_id`, `kind` (offer / contract / confirmation / warning), `locale`, `body` (with merge fields).

**onboarding_tasks** — `employee_id`, title, `owner_role`, `due_date`, `done_at`.

**probation_reviews** 🔒 (HIR-07) — `employee_id`, `reviewer_id`, `due_date`, `ratings jsonb` (criterion → 1–5), `comments`, `recommendation enum` (confirm / extend / end), `extend_months`, `status`, `approval_id`, `letter_path`.

### 3.4b Announcements, policies & signatures (POL, EMP-08/09)

**announcements** — `title_en`, `title_ms`, `body_en`, `body_ms`, `audience jsonb` ({all | branch_ids | role_ids}), `pinned`, `publish_at`, `created_by`.
**announcement_reads** — `announcement_id`, `employee_id`, `read_at`.

**policy_documents** — `code` (e.g. `HANDBOOK`, `PDPA_NOTICE`), `title_en`, `title_ms`, `version int`, `file_path`, `audience jsonb`, `requires_signature bool`, `published_at`, `superseded_at`. One row per version.

**signatures** 🔒 (POL-03; generic) — `entity_type` (policy_document / offer / contract / probation_letter), `entity_id`, `signer_employee_id` or `signer_candidate_id`, `typed_name`, `consent_text`, `signed_at`, `ip`, `user_agent`, `document_sha256`, `signed_pdf_path`. Insert-only.

Directory and org chart (EMP-08/09) need no new tables: they read a restricted view **v_directory** (name, photo, title, branch, work contact, manager_id, credential status) that every member of the tenant may read.

### 3.5 Leave

**leave_types** — code, name_en/ms, `is_paid`, `is_statutory`, `requires_attachment`.

**leave_policies** — `leave_type_id`, `min_service_months`, `max_service_months`, `days_per_year`, `carry_forward_max`, `carry_forward_expiry_months`. Statutory rows are seeded as the floor.

**leave_balances** — `employee_id`, `leave_type_id`, `year`, `entitled`, `carried_forward`, `taken`, `pending`, `adjusted`.

**leave_requests** 🔒 — `employee_id`, `leave_type_id`, `start_date`, `end_date`, `half_day`, `days`, reason, `attachment_path`, status, `approval_id`.

**public_holidays** — `state_code` (or `ALL`), date, name, `is_compulsory`.

### 3.6 Attendance, roster, OT

**roster_shifts** — `branch_id`, `employee_id`, `shift_date`, `start_time`, `end_time`, `room_or_service`, `is_on_call`, `published_at`.

**attendance_logs** 🔒 — `employee_id`, `branch_id`, `clock_in_at`, `clock_out_at`, `in_lat/lng`, `out_lat/lng`, `within_geofence bool`, `selfie_path`, `source` (pwa / manual).

**ot_requests** 🔒 — `employee_id`, `work_date`, `day_type enum` (normal / rest_day / public_holiday), `hours`, status, `approval_id`, `calculated_amount`.

### 3.7 Claims

**claim_types** — name, `monthly_limit`, `per_claim_limit`, `is_taxable`, `eligible_role_ids uuid[]`.

**claims** 🔒 — `employee_id`, `claim_type_id`, `expense_date`, amount, description, status, `approval_id`, `payroll_run_id` (set when paid).

**claim_receipts** — `claim_id`, `file_path`.

### 3.8 Payroll

**pay_items** — code, name, `kind enum` (earning / deduction / employer_cost), `is_epf_wage`, `is_socso_wage`, `is_eis_wage`, `is_pcb_taxable`, `is_hrd_wage`, `pcb_type enum` (normal / additional) — additional = bonus, arrears, commission (PCB on additional remuneration).

**recurring_pay_items** — `employee_id`, `pay_item_id`, amount, `start_month`, `end_month`.

**payroll_runs** 🔒
| column | type | notes |
|---|---|---|
| period_month | date | first day of month |
| pay_date | date | must be within 7 days after period end |
| status | enum `payroll_status` | draft / calculated / reviewed / approved / locked / paid |
| is_shadow | bool | parallel-run mode (PAY-09) |
| rate_version_id | uuid | statutory rates snapshot used |
| company_bank_account_id | uuid | paying account chosen for this run; defaults to the tenant's default account; frozen on lock |
| bank_file_format_code | text | snapshot of the format used, so old runs re-export identically after a bank switch |
| approved_by / approved_at / locked_at | | |

**payslips** 🔒 — `payroll_run_id`, `employee_id`, gross, `epf_ee`, `epf_er`, `socso_ee`, `socso_er`, `eis_ee`, `eis_er`, `pcb`, `zakat`, `hrd_levy`, net, `ytd jsonb` (running totals needed by PCB), `pdf_path`.

**payslip_lines** — `payslip_id`, `pay_item_id`, `description`, `quantity` (hours / sessions / days), `rate`, `amount`.

**payroll_inputs** — `payroll_run_id`, `employee_id`, `pay_item_id`, `quantity`, amount, `source` (manual / attendance / claims / clinic_sessions).

**payroll_exports** — `payroll_run_id`, `kind` (bank / epf / socso_eis / pcb / journal), `bank_file_format_code` (for bank kind), `file_path`, `generated_at`.

**year_end_forms** — `tenant_id`, year, `employee_id`, `form` (EA / CP8D), `pdf_path`.

### 3.9 Statutory reference data (global, versioned)

**statutory_rate_versions** — `id`, `name` (e.g. "2026-01 rates"), `effective_from`, `effective_to`, `source_note` (link to official table).

**epf_rate_bands** — `version_id`, `category` (malaysian_lt60 / malaysian_60plus / foreign / pr_pre1998 …), `wage_from`, `wage_to`, `ee_amount`, `er_amount`. Loaded from the official Third Schedule (bracket table, not a raw %).

**socso_rate_bands** — `version_id`, `category` (cat1_injury_invalidity / cat2_injury_only / foreign), `wage_from`, `wage_to`, `ee_amount`, `er_amount`.

**eis_rate_bands** — `version_id`, `wage_from`, `wage_to`, `ee_amount`, `er_amount`.

**pcb_parameters** — `year`, `key`, `value jsonb` (tax brackets, reliefs, rebates — per the LHDN MTD computerised calculation specification for that year).

**minimum_wage_rates** — `effective_from`, `applies_to` (all / non_msme / msme), `monthly`, `daily_by_workdays jsonb`, `hourly`.

### 3.10 Cross-cutting

**approvals** / **approval_steps** — `entity_type`, `entity_id`, `step_no`, `approver_role` or `approver_user_id`, status, comment, `acted_at`.

**compliance_alerts** — `tenant_id`, `code` (e.g. `CRED_EXPIRED`, `BELOW_MIN_WAGE`), `severity`, `entity_type`, `entity_id`, message, `detected_at`, `resolved_at`.

**notifications** — `user_id`, `title`, `body`, `link`, `channel`, `read_at`.

**audit_log** — `tenant_id`, `table_name`, `row_id`, `action`, `old_data jsonb`, `new_data jsonb`, `actor_id`, `at`. Insert-only (no update / delete policy).

**data_breach_incidents** (CMP-05) — `detected_at`, description, `data_affected`, `individuals_count`, `notified_commissioner_at`, `notified_subjects_at`, `remediation`.

---

## 4. Enums

```
app_role:            owner, hr_admin, payroll_approver, manager, staff, auditor
employee_status:     preboarding, active, on_notice, left
employment_type:     full_time, part_time, contract, locum_contractor
pay_model:           monthly, hourly, per_session
id_type:             mykad, passport
pcb_category:        single, married_spouse_not_working, married_spouse_working
credential_category: registration, practising_cert, clinical_cert, vaccination, safeguarding, other
credential_status:   draft, pending, verified, rejected, superseded, withdrawn
enforcement_mode:    soft, hard
candidate_stage:     applied, interview, offer, hired, rejected
payroll_status:      draft, calculated, reviewed, approved, locked, paid
checklist_status:    not_started, in_progress, done, not_applicable
```

---

## 5. RLS model

Helper functions (SECURITY DEFINER, stable):
- `auth_tenant_id()` → tenant of the current user's active membership
- `auth_role()` → role in that tenant
- `auth_employee_id()` → the user's own employee record
- `is_manager_of(employee_id)` → true if employee is in the manager's branch scope

| Table group | Staff | Manager | HR Admin / Owner | Auditor |
|---|---|---|---|---|
| employees | own row (read; edits via change request) | team rows (read, limited columns via view) | full | read |
| bank_accounts, id_no | own (masked) | none | full | none |
| company_bank_accounts | none | none | read: HR; write: Owner only | read (masked) |
| staff_credentials, cpd_activities | own: read, insert, update while pending | team: **status via view only** | full + verify | read |
| restricted credential types (vaccination / health) | own | **none** | full | none |
| v_directory | read (all in tenant) | read | read | read |
| announcements, policy_documents | read (own audience) | read | full | read |
| signatures | own | none | read | read |
| probation_reviews | none | own reviewees: read, write | full | read |
| credential_files (storage) | own | **none** | full | none |
| leave / OT / claims | own: read, insert | team: read, approve | full | read |
| attendance_logs | own: insert, read | team: read | full | read |
| payslips | own (locked runs only) | none | full | read |
| payroll_runs | none | none | full (approve = owner/payroll_approver) | read |
| audit_log | none | none | read | read |
| statutory reference tables | read | read | read | read |

Every policy also includes `tenant_id = auth_tenant_id()`.

---

## 6. Storage buckets (all private)

| Bucket | Path pattern | Access |
|---|---|---|
| `credentials` | `{tenant_id}/{employee_id}/{credential_id}/{file}` | owner of record + HR; signed URL ≤ 5 min |
| `documents` | `{tenant_id}/{employee_id}/{doc_type}/{file}` | owner + HR |
| `receipts` | `{tenant_id}/{employee_id}/{claim_id}/{file}` | owner + approver + HR |
| `payslips` | `{tenant_id}/{run_id}/{employee_id}.pdf` | owner (after lock) + HR |
| `exports` | `{tenant_id}/{run_id}/{kind}.{ext}` | HR / payroll approver |
| `selfies` | `{tenant_id}/{employee_id}/{date}/{file}` | HR; auto-purge after 90 days |
| `policies` | `{tenant_id}/{policy_code}/v{version}.pdf` | audience: read; HR: write |
| `signed` | `{tenant_id}/{entity_type}/{entity_id}/{signature_id}.pdf` | signer + HR; never overwritten |
| `avatars` | `{tenant_id}/{employee_id}.jpg` | tenant members: read; owner of photo + HR: write |

Max file size 10 MB; allowed MIME enforced in an upload Edge Function, not only in the UI.

---

## 7. Scheduled jobs (pg_cron)

| Job | Schedule (MYT) | Does |
|---|---|---|
| `credential_status_scan` | daily 06:00 | recompute validity, raise `compliance_alerts`, queue reminders at offsets |
| `compliance_red_flag_scan` | daily 06:15 | minimum wage, missing statutory nos., permits, OT limits |
| `statutory_deadline_reminders` | daily 08:00 | upcoming contribution / PCB / year-end deadlines |
| `leave_year_rollover` | 1 Jan 00:30 | new balances, carry-forward, expiry |
| `selfie_purge` | weekly | delete selfies older than retention |
| `cpd_progress_scan` | weekly Mon 06:30 | flag staff below pro-rated CPD target within 90 days of renewal |
| `probation_reminders` | daily 07:00 | remind manager 30 / 14 / 7 days before probation end |
| `policy_ack_reminders` | daily 09:00 | remind staff with unsigned required policies (after 3 and 7 days) |
