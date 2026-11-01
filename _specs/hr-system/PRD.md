# Rakan — HR Management System — Product Requirements (PRD)

Version: 0.1 (draft) · Date: 29 Oct 2026 · Owner: Afiq
Status: Planning — not yet built

---

## 1. Context

| Item | Value |
|---|---|
| Purpose | HR + payroll system for a healthcare / therapy centre, compliant with Malaysian law |
| Launch mode | Internal first (own company), SaaS-ready architecture, SaaS launch later |
| Company stage | Being set up now; 5–10 staff planned; **no one hired yet** |
| Locations | 1 branch at launch (model supports multiple) |
| Stack | Next.js + TypeScript + Tailwind (PWA) · Supabase (Auth, Postgres + RLS, Storage, Edge Functions, pg_cron) |
| Product name / UI | **Rakan** (official). Wordmark in the logo is lowercase "rakan"; use "Rakan" in all copy, titles and documents · UI system in `ui-system.md`, reference screens in `ui-reference/` |
| Key constraint | System must support **hiring and onboarding first**, and payroll must be live **before the first payday** |

## 2. Goals

1. Hire, onboard and pay the first 5–10 staff fully inside the system, with no Excel.
2. Be correct by default on Malaysian statutory obligations: Employment Act 1955, EPF, SOCSO, EIS, PCB/MTD, HRD Corp, PDPA 2010 (as amended 2024).
3. Never let a practitioner work with an expired licence or certification without someone being alerted.
4. Keep the architecture multi-tenant (`tenant_id` + RLS) so SaaS needs no rewrite.

## 3. Non-goals (for now)

- Multi-country payroll
- Direct API submission to KWSP / PERKESO / LHDN (the system generates files; a human uploads them)
- Full LMS, biometric hardware, benefits marketplace
- Tenant signup, billing, tenant admin UI (SaaS phase only)

## 4. Users and roles

| Role | Can do |
|---|---|
| **Owner** | Everything, including approving payroll release |
| **HR Admin** | Manage staff, leave, claims, credentials verification, prepare payroll |
| **Payroll Approver** | Review and approve a payroll run (can be the Owner) |
| **Manager / Clinical Lead** | Approve team leave, OT, claims; view team roster and credential *status* (not files) |
| **Staff** | Self-service: profile, leave, claims, clock-in, payslips, **own credentials** |
| **Candidate / New hire** | Pre-boarding portal only: fill in details, upload documents and certs before day 1 |
| **Auditor (read-only)** | Read reports and records; no edits (for accountant or inspection) |

## 5. Scope by phase

### 5.1 Feature map — benchmarked against BambooHR, BrioHR and healthcare needs

Selection rule for the MVP: needed to **hire, onboard, roster, pay and stay compliant** with 5–10 clinical staff, or **legally / clinically required** for a healthcare provider. Everything else waits.

**General HR (what BambooHR and BrioHR offer)**

| Module | BambooHR | BrioHR | Rakan |
|---|---|---|---|
| Employee records, documents, custom fields | ✓ | ✓ | **MVP** (custom fields → v2) |
| Directory & org chart | ✓ | ✓ | **MVP** |
| Employee self-service (mobile) | ✓ | ✓ | **MVP** (PWA) |
| Announcements | ✓ | ✓ | **MVP** |
| Policy acknowledgement & e-signature | ✓ (e-sign) | ✓ | **MVP-lite**: click-to-sign with audit trail for contracts and policies; signing-provider e-sign → v2 |
| Applicant tracking | ✓ | ✓ | **MVP-lite**: openings, pipeline, offer. Careers page + job-board posting → v2 |
| Onboarding | ✓ | ✓ | **MVP** (pre-boarding portal + checklist) |
| Offboarding | ✓ | ✓ | v2 (final pay is MVP) |
| Time off | ✓ | ✓ | **MVP** |
| Attendance / time tracking | add-on | ✓ (geofence) | **MVP** (geofence + selfie) |
| Shift scheduling | — | ✓ | **MVP** (clinical roster) |
| Claims / expenses | — | ✓ | **MVP** |
| Payroll | US only | ✓ MY/SG | **MVP** (Malaysian statutory) |
| Performance: goals, reviews, 360 | ✓ | ✓ | **MVP: probation review only**. Full cycles, goals, 360 → v2 |
| Engagement surveys / eNPS | ✓ | ✓ | v2 |
| Training / LMS | tracking | ✓ | **MVP: CPD + mandatory-training tracking**. Course delivery → v3 |
| Benefits administration | ✓ | ✓ | v2 (panel clinic, GHS/GTL) |
| Reports & dashboards | ✓ | ✓ | **MVP: core reports**. Custom report builder → v2 |
| Integrations (accounting, calendar, chat) | ✓ | ✓ | **MVP: journal CSV export**. Xero / Google Calendar / WhatsApp → v2 |
| HR helpdesk, rewards & recognition, compensation planning | some | ✓ | v3 |

**Healthcare-specific (where Rakan differs)**

| Module | Who needs it | Rakan |
|---|---|---|
| Credential & licence tracker (registration, APC / practising certificate) with staff self-upload and HR verification | clinics, therapy centres, consultants | **MVP** |
| Role → required-credential matrix; roster warning / block when expired | clinics, therapy centres | **MVP** |
| Mandatory training as expiring certificates (BLS, infection control, fire safety) | all | **MVP** |
| CPD log with points vs renewal target | all registered practitioners | **MVP** |
| Professional indemnity insurance expiry | doctors, therapists, consultants | **MVP** (credential type) |
| Vaccination / occupational-health records (restricted access) | clinics, therapy centres | **MVP** (credential type) |
| Child-safeguarding / background checks | therapy & EIP centres | **MVP** |
| Clinical roster by room / service | clinics, therapy centres | **MVP** |
| Sessional / per-session and hybrid pay | therapy centres | **MVP** |
| Inspection-ready staffing and credential pack | clinics (KKM), therapy centres | **MVP** |
| Clinic & Therapy System link (completed sessions → pay) | therapy centres | v2 |
| Locum / contractor register and payouts (outside payroll) | clinics | v2 |
| Workplace incident reporting (needlestick, injury → SOCSO / DOSH) | clinics | v2 |
| Clinical supervision log (junior therapists, interns) | therapy centres | v2 |
| Skill-mix rules on roster (e.g. "one registered nurse per shift") | clinics | v2 |
| Consultant client / project timesheets, billable hours, site deployment | health management consultants | v2 |
| Credential portfolio export for client tenders | health management consultants | v2 |
| Scope of practice / clinical privileging | clinics | v3 |

### 5.2 MVP (required before the first hire / first payday)
1. Foundation: auth, roles, approval engine, audit log, notifications, BM/EN, PWA
2. Company and employer setup + **Employer Setup Checklist**
3. Employee records, directory and org chart
4. **Credentials, licences, mandatory training and CPD** (staff self-service + HR verification)
5. Announcements, policies and click-to-sign acknowledgements
6. **Hiring-lite, pre-boarding, onboarding and probation review**
7. Leave
8. Clinical roster, attendance and OT
9. Claims
10. Payroll engine + payroll run + payslips + bank-agnostic payment files + statutory files
11. Compliance Centre, core reports, staff and manager home screens
12. Security & PDPA hardening, deployment

### 5.3 v2 (after go-live, first 3–6 months of use)
Clinic & Therapy System integration (sessions → pay) · Offboarding · Full performance management (goals, review cycles, 360) · Engagement surveys / eNPS · Disciplinary & Domestic Inquiry · FWA requests · Locum / contractor register · Incident reporting · Clinical supervision log · Skill-mix roster rules · Consultant timesheets & billable hours · Credential portfolio export · Benefits (panel clinic, GHS) · HRD Corp training claims · Careers page · Custom fields · Custom report builder · Xero / Google Calendar / WhatsApp integrations · Signing-provider e-signature

### 5.4 v3 (SaaS launch)
Tenant signup and billing · Tenant admin · PDPA processor toolkit · AI HR assistant · AI letter drafting · HR helpdesk · Rewards & recognition · Compensation planning · Scope of practice / privileging · Course delivery (LMS)

---

## 6. Functional requirements — MVP

IDs are referenced in `build-order.md`.

### 6.1 Foundation (FND)
- **FND-01** Email / phone-OTP login via Supabase Auth. Roles stored on `memberships` (user × tenant × role).
- **FND-02** Every business table has `tenant_id`; RLS enforces tenant isolation and role scope.
- **FND-03** Generic approval engine: request → one or more approval steps → approved/rejected, with comments. Used by leave, OT, claims, credential verification and payroll release.
- **FND-04** Audit log for every insert, update and delete on sensitive tables (who, when, before/after).
- **FND-05** UI in English and Bahasa Malaysia (toggle per user).
- **FND-06** Installable PWA; mobile-first layouts for all staff-facing screens.
- **FND-07** Notifications: in-app + email; WhatsApp via n8n webhook (optional per tenant).

### 6.2 Company & employer setup (ORG)
- **ORG-01** Company profile: legal name, SSM no., address, state (drives public holidays), MSME status.
- **ORG-02** Employer numbers: EPF employer no., SOCSO employer code, LHDN E-number, HRD Corp no. (optional under 10 staff). Company payroll bank accounts are managed separately (PAY-10): add, set default, retire.
- **ORG-03** Branches: name, address, geofence (lat, lng, radius), operating hours.
- **ORG-04** **Employer Setup Checklist**: a guided list of one-off registrations, each with status and evidence upload. Items: EPF employer registration, SOCSO registration, LHDN E-number, company bank account for payroll, HRD Corp (if applicable), PDPA privacy notice published, DPO appointed. Shows deadlines relative to the first hire date.

### 6.3 Employee records (EMP)
- **EMP-01** Personal: full name (as in MyKad), MyKad / passport no., nationality, DOB, gender, marital status, religion (only for zakat handling, optional), contacts, address, emergency contact.
- **EMP-02** MyKad parsing: derive DOB and gender from the IC number; validate the format.
- **EMP-03** Employment: job title, role category (clinical / non-clinical), employment type (full-time / part-time / contract / locum-contractor), pay model (monthly / hourly / per-session), start date, probation end, confirmation date, branch, manager.
- **EMP-04** Statutory: EPF no., SOCSO no., income tax no., EIS eligibility, PCB category (single / married with spouse working / married with spouse not working), number of eligible children, zakat amount.
- **EMP-05** Bank: bank name, account no., account holder name.
- **EMP-06** Documents vault (IC copy, contract, offer letter, etc.) with optional expiry dates.
- **EMP-07** Profile change requests from staff (address, bank, contacts) require HR approval; bank changes are always flagged.
- **EMP-08** Staff directory: name, photo, job title, branch, work phone / email, credential status badge (status only). Searchable from the top-nav search.
- **EMP-09** Org chart generated from `manager_id`; click a person to open their directory card.

### 6.4 Credentials & licences (CRD) ⭐
Healthcare and therapy staff depend on valid registrations and certifications. Staff maintain their own; HR verifies.

**Catalogue and requirements**
- **CRD-01** Credential type catalogue (per tenant, seeded with defaults), for example:
  - Professional registration: MMC (doctors), Malaysia Nursing Board, MAHPC (physiotherapists, occupational therapists, speech-language therapists and other allied health professionals)
  - Annual practising certificate (APC / practising certificate)
  - BLS / CPR certificate
  - First aid certificate
  - Vaccination record (e.g. Hepatitis B)
  - Child-safeguarding training / background check (therapy and EIP)
  - Specialist / therapy-method certifications (custom)
- **CRD-02** Each type has: name, issuing body, `has_expiry` (bool), default validity months, renewal reminder offsets (default 90/60/30/7 days), `requires_verification` (bool), allowed file types.
- **CRD-03** **Role requirement matrix**: per job role, which credential types are *mandatory* vs *optional*. Example: Speech-Language Therapist → MAHPC registration (mandatory), practising certificate (mandatory), BLS (mandatory), safeguarding (mandatory).

**Staff self-service (the feature you requested)**
- **CRD-04** Staff see "My Credentials": every required and optional credential for their role, with status chips (Missing / Pending verification / Valid / Expiring soon / Expired / Rejected).
- **CRD-05** Staff can **add or renew** a credential:
  - Pick the credential type
  - Enter: registration / certificate no., issuing body, **effective (issue) date**, **expiry date** (required if `has_expiry`), optional CPD points, notes
  - **Upload the certificate** (PDF / JPG / PNG, max 10 MB; multiple pages allowed)
  - Submit → status becomes **Pending verification**
- **CRD-06** Validation: expiry date must be after effective date; an effective date in the future is allowed (status *Upcoming*, becomes active on that date); duplicate active records of the same type are blocked (a renewal supersedes instead).
- **CRD-07** **Renewal = new version.** The new record links to the previous one. When the renewal is verified, the old one becomes *Superseded*. Full history is kept and never deleted by staff.
- **CRD-08** Staff can edit or withdraw a submission only while it is *Pending*. After verification, changes require a new submission.

**HR verification**
- **CRD-09** HR queue of pending credentials. HR opens the uploaded file side by side with the entered data, checks it against the issuing body's public register where available, then:
  - **Verify** → records verifier, date and method (e.g. "checked MAHPC online register")
  - **Reject** → reason required; staff are notified to resubmit
- **CRD-10** HR can also enter credentials on behalf of staff (e.g. during onboarding).

**Status, alerts, enforcement**
- **CRD-11** Daily job computes status: *Valid*, *Expiring soon* (within the type's first reminder offset), *Expired*.
- **CRD-12** Reminders to the staff member and HR at each offset (default 90/60/30/7 days) and on the expiry date. Channels: in-app, email, WhatsApp (optional).
- **CRD-13** Per-staff **credential compliance %** = valid mandatory credentials ÷ total mandatory credentials.
- **CRD-14** Enforcement setting per tenant: *Soft* (warning when rostering) or *Hard* (cannot be rostered to clinical shifts when a mandatory credential is expired or missing). Default: Soft.
- **CRD-15** Compliance view: a matrix of staff × required credentials, colour-coded, exportable to PDF (for KKM or facility inspections).

**Privacy**
- **CRD-16** Files are stored in a private bucket and accessed through short-lived signed URLs only. Staff see their own files; HR / Owner see all; Managers see **status only**, not files.

**Mandatory training, CPD, indemnity**
- **CRD-17** Seeded credential types also cover mandatory training (BLS / CPR, infection control, fire safety), professional indemnity insurance and vaccination records. Vaccination records are visible to the staff member and HR only.
- **CRD-18** CPD log: staff record a CPD activity (title, provider, date, points / hours, category, certificate upload). HR verifies like a credential.
- **CRD-19** CPD target per credential type (e.g. points required per renewal cycle — ⚠ VERIFY each professional body's rule). Staff see progress toward the target for their current cycle; the Compliance Centre flags staff below the pro-rated target 90 days before renewal.

### 6.5 Hiring-lite & onboarding (HIR)
- **HIR-01** Job openings: title, role, employment type, pay model, salary range.
- **HIR-02** Candidates: simple pipeline (Applied → Interview → Offer → Hired / Rejected) with CV upload.
- **HIR-03** Offer letter and employment contract generator from templates (BM/EN) that include the Employment Act minimum terms. Output as PDF.
- **HIR-04** **Pre-boarding portal**: on offer acceptance, the candidate gets a link to fill in personal, bank and statutory details and **upload their credentials** (uses CRD-05) before the start date.
- **HIR-05** "Convert to employee" creates the employee record, credential records, leave balances and an onboarding checklist.
- **HIR-06** Onboarding checklist per hire (e.g. register with EPF/SOCSO, issue uniform, system accounts, orientation, credential verification complete).
- **HIR-07** Probation review: reminder to the manager 30 days before probation ends; simple review form (ratings on 4–6 criteria + comments + recommendation: confirm / extend / end); Owner approval; generates a confirmation or extension letter; updates `confirmed_on`.
- **HIR-08** Offer and contract acceptance by click-to-sign (POL-03), stored with the signed PDF.

### 6.6 Leave (LVE)
- **LVE-01** Leave types: annual, sick, hospitalisation, maternity, paternity, unpaid, replacement, compassionate (custom), plus custom types.
- **LVE-02** Entitlements are calculated by years of service with Employment Act minimums as the floor (see `payroll-rules.md` §6). Company policy can be higher, never lower.
- **LVE-03** Pro-rating for joiners and leavers; carry-forward rules; expiry.
- **LVE-04** Public holidays per state + federal; replacement day when a holiday falls on a rest day.
- **LVE-05** Apply → manager approval → balance update; unpaid leave feeds payroll.
- **LVE-06** Team calendar showing leave and clashes with the roster.

### 6.7 Attendance, roster & OT (ATT)
- **ATT-01** Clock in / out from the PWA with geofence check against the branch; optional selfie.
- **ATT-02** Roster: shifts by day, by staff, by room / service; publish to staff.
- **ATT-03** Roster checks: leave clashes, credential status (CRD-14), weekly-hours cap.
- **ATT-04** OT requests and approval; OT calculated per `payroll-rules.md` §5.
- **ATT-05** Alerts: over 45 h/week normal hours, over the monthly OT limit.

### 6.8 Claims (CLM)
- **CLM-01** Claim types with limits per role; receipt upload; approval; approved claims flow into the next payroll as non-taxable or taxable items.

### 6.9 Payroll (PAY)
- **PAY-01** Pay items catalogue: basic, fixed allowances, OT, sessional pay, claims, bonus, commission, deductions (unpaid leave, advance, other).
- **PAY-02** Statutory engine as Postgres functions: EPF, SOCSO, EIS, PCB (MTD), zakat offset, HRD Corp levy. Rates live in versioned tables with effective dates.
- **PAY-03** Supports monthly-salaried, hourly part-time and per-session pay models.
- **PAY-04** Payroll run lifecycle: Draft → Calculated → Reviewed → Approved → Locked → Paid. Locked runs cannot change; corrections go into the next run as adjustments.
- **PAY-05** Checks before approval: minimum wage, missing statutory numbers, negative net pay, large month-on-month variance.
- **PAY-06** Outputs: payslip PDF (BM/EN), bank bulk payment file (see PAY-10), EPF contribution file, SOCSO/EIS file, PCB (e-PCB) file, payroll summary, journal export (CSV).
- **PAY-10** **Bank-agnostic payments.** No bank is hard-wired.
  - The company can register **multiple payroll bank accounts** (any Malaysian bank) and mark one as default. Accounts can be added, switched or retired at any time; history is kept.
  - Each payroll run selects which company account pays it (defaults to the current default account). The choice is locked with the run.
  - Bank bulk-payment files are produced by **format adapters**: one adapter per bank file spec (e.g. Maybank2u Biz, CIMB BizChannel, Public Bank PBe, RHB Reflex, Bank Islam GO, Hong Leong ConnectFirst, AmBank AmAccess). Adding a new bank = adding an adapter, no change to payroll logic.
  - A **generic CSV / DuitNow Bulk-style export** is always available as a fallback when a bank's adapter does not exist yet (configurable column mapping).
  - Employee bank details remain per employee (any bank); the payment file handles same-bank and interbank (IBG / DuitNow) lines as the chosen bank's format requires.
  - Switching banks mid-year does not affect statutory files, payslips or year-end forms.
- **PAY-07** Year-end: EA Form per employee, CP8D, Form E data.
- **PAY-08** Final pay for leavers (pro-rated salary, leave encashment if policy allows).
- **PAY-09** **Parallel-run mode**: mark a run as "shadow" so it can be compared against an external calculator before going live.

### 6.10 Compliance Centre (CMP)
- **CMP-01** Statutory deadline calendar (monthly contributions, PCB, year-end forms).
- **CMP-02** Red-flag scanner (daily): pay below minimum wage, expired or missing mandatory credentials, expiring work permits, missing statutory numbers, OT over the limit, unpaid wages past the legal deadline, leave policy below the Employment Act minimum.
- **CMP-03** Employer Setup Checklist status (ORG-04).
- **CMP-04** Inspection pack: export wage, attendance and leave records for a chosen period (retain 6+ years).
- **CMP-05** PDPA basics: privacy notice acknowledgment per staff member, DPO contact on the profile, data-breach incident register.

### 6.11 Staff self-service (ESS)
- **ESS-01** Mobile home: clock in, today's shift, leave balance, latest payslip, credential alerts.
- **ESS-02** Apply leave, claims, OT; view status.
- **ESS-03** My Credentials (CRD-04 to CRD-08).
- **ESS-04** Payslips and EA forms (download PDF).
- **ESS-05** Profile change requests (EMP-07).

### 6.12 Announcements, policies & acknowledgements (POL)
- **POL-01** Announcements: title, body (EN/MS), audience (all / branch / role), pin, publish date; read receipts.
- **POL-02** Policy library: versioned documents (e.g. employee handbook, leave policy, PDPA notice, infection-control SOP). Publishing a new version asks the selected audience to re-acknowledge.
- **POL-03** Click-to-sign: signer types their full name and ticks a consent box; the system records signer, timestamp, IP, device and a SHA-256 hash of the exact PDF signed, then stamps a signature page. Used for policies, offer letters and contracts. ⚠ VERIFY with a lawyer that this suffices for employment contracts under the Electronic Commerce Act 2006.
- **POL-04** Acknowledgement tracker: who has / hasn't signed each policy version, with reminders.

### 6.13 Reports (RPT)
- **RPT-01** Headcount and movement (joiners, leavers, by role / branch / employment type).
- **RPT-02** Leave: balances, taken, liability in RM.
- **RPT-03** Payroll: monthly cost by component (gross, employer statutory, net), by branch / role; year-to-date.
- **RPT-04** Credentials: compliance % over time, expiring in the next 30 / 60 / 90 days, CPD progress.
- **RPT-05** Attendance: lateness, absence, OT hours and cost.
All reports export to CSV and PDF; Auditor role can read them.

---

## 7. Non-functional requirements

| Area | Requirement |
|---|---|
| Security | RLS on every table; no service-role key in the browser; signed URLs for files; MFA for Owner / HR / Payroll Approver |
| Privacy (PDPA) | Collect only what is needed; privacy notice in BM/EN; access logged; retention rules per data type |
| Record retention | Wage, attendance and leave records kept at least 6 years; soft delete only |
| Data region | Supabase Singapore region; document the cross-border transfer in the privacy notice |
| Accuracy | Payroll functions covered by golden test cases; every rate change versioned with an effective date |
| Performance | Staff pages usable on mid-range Android over 4G |
| Language | Full BM/EN UI; payslips and letters in both |

## 8. Success criteria (internal launch)

- First hires onboarded through the pre-boarding portal, with credentials verified before day 1
- First payroll run matches the external calculator to the sen for every employee in the parallel run
- Zero expired mandatory credentials go unnoticed (every expiry triggers an alert at least 30 days ahead)
- All statutory files produced on time for the first 3 months

## 9. Open questions

1. ~~Which bank for payroll?~~ Resolved: bank-agnostic (PAY-10). Build the first adapter for whichever bank the company account is opened with, plus the generic CSV fallback.
2. Exact roles to hire first (e.g. speech therapist, occupational therapist, admin)? This seeds the role requirement matrix.
3. Will any locum or freelance therapists be paid as contractors (outside payroll)?
4. Enforcement for expired credentials: Soft or Hard at launch?
