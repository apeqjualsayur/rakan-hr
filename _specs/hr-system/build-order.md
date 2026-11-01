# Rakan — MVP Build Guide (Claude Code in VS Code)

Version: 1.0 · Date: 30 Oct 2026
Repo: `github.com/apeqjualsayur/rakan-hr` · Specs: `_specs/hr-system/` · Scope: PRD §5.2 (MVP). v2 / v3 features are listed in PRD §5.3–5.4 and are **not** built here.

How to read each step:
- **🧑 You do** — actions only you can take (accounts, decisions, checking).
- **🤖 Prompt** — paste into Claude Code exactly as written.
- **✅ Check** — what you test yourself before moving on. Do not start the next step until every check passes.

---

## Part A — The working loop (use for every step)

1. In VS Code, open the `rakan-hr` folder and start Claude Code.
2. Type `/clear` so each step starts with a clean context (CLAUDE.md is reloaded automatically).
3. Press **Shift+Tab** until the mode shows **Plan mode**. Paste the step's prompt.
4. Read the plan. If it touches things the step didn't ask for, reply: `Only do what this step asks. Remove <x> from the plan.` Then approve.
5. Let it build. When asked for permission to run commands, allow `npm`, `npx`, `supabase` and `git` commands; refuse anything that deletes folders outside the repo.
6. Run the **✅ Check** yourself in the browser (`http://localhost:3000`).
7. If something fails, paste the **Fix prompt** (below). After 3 failed attempts on the same problem, `/clear` and paste the **Stuck prompt**.
8. When all checks pass, paste the **Commit prompt**, then click **Sync** in VS Code's Source Control panel.

**Fix prompt**
```
This check failed: <describe what you did and what you saw>.
Error text (if any): <paste>
Find the root cause before changing code. Explain the cause to me in plain words, then fix it and tell me how to re-test.
```

**Stuck prompt**
```
We are on build step <N> of _specs/hr-system/build-order.md. This problem has resisted 3 fixes: <describe>.
Read the relevant spec sections and the code involved. List 3 possible root causes ranked by likelihood,
add logging or a test to confirm which one it is, then fix only that cause.
```

**Commit prompt**
```
Step <N> passes its checks. Run the full test suite and the linter. If both pass, commit with a message
"step <N>: <short summary> (<requirement IDs>)" and show me the commit. If anything fails, stop and tell me.
```

**Cloud migration prompt** (use after any step that added database migrations, once checks pass locally)
```
Push the new migrations to the cloud project with `supabase db push`. Show me the list of migrations
that will be applied before running it. Afterwards confirm the cloud schema matches local.
```

**Rules of thumb**
- Never paste passwords or secret keys into the Claude Code chat. When a key is needed, open `.env.local` in VS Code and paste it there yourself.
- Use only test data (fake names, fake IC numbers like `900101-14-5678`) until Step 18.
- Commit after every step. If a step goes badly wrong: `Undo all uncommitted changes since the last commit` and start the step again.

---

## Part B — Before you start (one-off, ~2–3 hours)

### B1. Install tools (Windows)
| Tool | How |
|---|---|
| Node.js LTS | nodejs.org → LTS installer |
| Git | git-scm.com (skip if VS Code already commits for you) |
| Docker Desktop | docker.com → start it and wait for "Engine running" |
| Supabase CLI | PowerShell: `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser` → `irm get.scoop.sh \| iex` → `scoop bucket add supabase https://github.com/supabase/scoop-bucket.git` → `scoop install supabase` → `supabase login` |
| VS Code + Claude Code extension | already installed |

### B2. Accounts
| Account | Purpose | Notes |
|---|---|---|
| Supabase — org **Rakan** (Pro), project **rakan-hr**, region **Singapore** | database, auth, files | Turn on MFA. Keep the Spend Cap on. Save URL, anon key, service-role key and project ref in your password manager. |
| Domain (e.g. `rakan.my` or `rakanhr.my`) | app address + email sender | Check MyIPO trademark (classes 9 and 42) first. |
| **Resend** (resend.com) | sending login codes and notifications | Verify your domain there. Supabase's built-in email has a very low hourly limit and is for testing only. |
| **Vercel** | hosting the web app | Hobby plan is for non-commercial use; business use needs Pro (about US$20/month). Check current terms. |
| GitHub | code | Optional: install the Claude GitHub App on `rakan-hr` so Claude can push for you. |

### B3. Fill in the company configuration
Open `_specs/hr-system/company-config.yaml` and replace every `TBC` you can. Leave unknowns as `TBC` — the system will show them as incomplete setup items. **Never** put IC numbers, passwords or keys in this file.

### B4. Book your accountant
You need about 2 hours with them before **Step 14** to resolve the ⚠ VERIFY items in `payroll-rules.md` and fill in the golden test values (§12).

### B5. Legal texts (in parallel, needed by Step 8)
- PDPA privacy notice for staff and candidates (EN + BM)
- Employee handbook (can start as a 5–10 page document)
- Offer letter and employment contract wording reviewed by a lawyer (Step 10 generates them from templates)

---

## Part C — Build steps

**Timeline guide** (part-time, ~10–12 hrs/week): Sprint 1 weeks 1–2 · Sprint 2 weeks 3–4 · Sprint 3 week 5 · Sprint 4 weeks 6–7 · Sprint 5 weeks 8–10 · Sprint 6 weeks 11–12.
**Hard gates:** Steps 1–10 live before the first offer letter. Steps 14–16 shadow-tested before the first payday.

### Sprint 1 — Foundation

#### Step 1 — Scaffold the project
🧑 You do: B1–B3 done; Docker running.

🤖 Prompt
```
Read CLAUDE.md and every file in _specs/hr-system/. Then scaffold the project in this repo root:
- Next.js (App Router) + TypeScript + Tailwind, configured as an installable PWA named "Rakan"
- Supabase: `supabase init`, local development with `supabase start`, and link the CLI to my cloud
  project (ref: <PASTE PROJECT REF>) for deploying migrations later. Do not push anything to cloud yet.
- Supabase client helpers for browser and server; env vars in .env.local (I will paste the values myself)
  and a committed .env.example with empty values
- next-intl with English and Bahasa Malaysia; language toggle in the header; all strings in message files
- Testing: Vitest for TypeScript, pgTAP for database (supabase test db), Playwright for a smoke test
- ESLint + Prettier
- Placeholder layouts only: desktop top nav for admin roles, mobile bottom nav for staff (ui-system.md §3)
- Update CLAUDE.md "Commands" with: start/stop local Supabase, dev server, tests, lint, push migrations
Do not build any features. Show me the folder tree and tell me exactly which values to paste into .env.local.
```
✅ Check
- [ ] `npm run dev` opens the app at localhost:3000
- [ ] Language toggle switches EN ↔ BM
- [ ] `npm test` and `supabase test db` run (even with 0 tests)
- [ ] `.env.local` is **not** shown in Source Control changes

#### Step 2 — UI system and component library
🤖 Prompt
```
Read _specs/hr-system/ui-system.md and look at every image in _specs/hr-system/ui-reference/.
- Add the tokens from ui-system.md §7 to the Tailwind config; load Inter (the only typeface) with next/font/google as --font-inter
- Install shadcn/ui and lucide-react; restyle primitives with the tokens
- Build every component in ui-system.md §4 in src/components/ui/, with all states in §4.1
- Create src/lib/status-styles.ts mapping every status (credential, CPD, leave, claim, OT, payroll, policy) to tag/chip styles
- Build the two shells: desktop TopNav layout and mobile BottomNav layout (§3)
- Build a /design page showing every component and state, plus static recreations of the three
  reference screens with dummy data, so I can compare them side by side with the images
- Apply the fixes in ui-system.md §6
Test at 375 px, 768 px and 1440 px widths and in Bahasa Malaysia.
```
✅ Check
- [ ] `/design` shows all components; the three recreated screens look like the reference images
- [ ] On your phone (same Wi-Fi, use the "Network" URL Next.js prints) the staff screens fit with no sideways scrolling
- [ ] Payroll stepper shows all 6 states on one line; shift time doesn't wrap
- [ ] BM text doesn't overflow buttons

#### Step 3 — Login, roles, security, approvals, notifications (FND-01 → FND-07)
🧑 You do: In Resend, verify your domain and create an API key. In Supabase (cloud) → Authentication → SMTP, enter Resend's SMTP details. Paste the Resend API key into `.env.local` when asked.

🤖 Prompt
```
Implement PRD 6.1 (FND-01 to FND-07) using data-model.md §3.1, §3.10, §4 and §5.
- Migrations: tenants, branches, memberships, approvals, approval_steps, notifications, audit_log, all enums in §4
- RLS helper functions auth_tenant_id(), auth_role(), auth_employee_id(), is_manager_of(); RLS on every table
- Generic audit trigger; attach to every 🔒 table now and in future steps
- Supabase Auth with email OTP (6-digit code); after login load membership and role; role-based route guards
- MFA (TOTP) required for owner, hr_admin and payroll_approver roles
- Generic approval engine: create request, approve / reject step with comment, notify next approver
- Notifications: in-app bell + email via Resend (React Email templates in EN and MS); a single
  notify(user, template, data) function that later steps reuse
- Seed: tenant + branch from _specs/hr-system/company-config.yaml; Owner membership for owner_email
- pgTAP tests: tenant A cannot read tenant B; staff cannot read other staff; audit rows are written
Then run the cloud migration prompt only after I confirm the checks pass.
```
✅ Check
- [ ] You receive a login code by email and can sign in as Owner
- [ ] MFA setup is forced for your Owner account
- [ ] A second test tenant's data is invisible (Claude Code shows the test result)
- [ ] Bell icon shows a test notification

#### Step 4 — Company setup and Employer Setup Checklist (ORG-01 → ORG-04)
🤖 Prompt
```
Implement PRD 6.2 (ORG-01 to ORG-04).
- Company profile screen (prefilled from company-config.yaml): SSM no., state, MSME status, employer numbers
- Branch screen with a map picker for the geofence (lat, lng, radius) and operating hours
- Settings > Users: invite people by email and assign a role (owner, hr_admin, payroll_approver, manager, staff, auditor)
- setup_checklist_items seeded with: KWSP employer registration, PERKESO registration, LHDN employer E-number,
  payroll bank account, PDPA privacy notice published, DPO appointed, HRD Corp (optional under 10 staff)
- Each item: status, due date (some relative to first hire date), evidence upload; progress card on Owner home
```
✅ Check
- [ ] Company profile and branch geofence save correctly (pin is on your building)
- [ ] You can invite your accountant as Auditor and they can log in read-only
- [ ] Checklist shows 7 items; uploading evidence marks one done

### Sprint 2 — People

#### Step 5 — Employee records, directory, org chart (EMP-01 → EMP-09)
🤖 Prompt
```
Implement PRD 6.3 (EMP-01 to EMP-09) with data-model.md §3.2 and §3.4b (v_directory).
- Tables: employees, employment_records, dependents, bank_accounts, documents, profile_change_requests
- Encrypt id_no and bank account_no at rest (Supabase Vault / pgsodium); show masked in UI
- MyKad parser: validate format, derive date of birth and gender; unit tests incl. people born 2000+
- Admin: People list with filters; employee page in tabs (Personal, Employment, Statutory, Bank, Dependents, Documents)
- Staff: My Profile (read-only) + "Request change" via the approval engine; bank changes always need HR approval
- Directory (cards with photo, title, branch, work contact, credential status badge) and org chart from manager_id
- Top-nav search finds people by name and title
- Document upload to private 'documents' bucket; signed URLs only
Seed 8 fake employees (fake IC numbers) across the roles in company-config.yaml for testing.
```
✅ Check
- [ ] Create an employee; their date of birth and gender fill in from the IC number
- [ ] IC and bank numbers show masked (••••)
- [ ] Log in as a staff test user: you see only your own profile; your bank-change request appears in HR's approvals
- [ ] Org chart shows the reporting lines you set

#### Step 6 — Credentials, mandatory training, CPD ⭐ (CRD-01 → CRD-19)
🧑 You do: Decide credential requirements per role (fill the table in PRD CRD-03 example or tell Claude Code). Check each professional body's CPD rule if you want CPD targets switched on now.

🤖 Prompt
```
Implement PRD 6.4 (CRD-01 to CRD-19) with data-model.md §3.3 (incl. CPD), §5 and §6.
Data:
- credential_types seeded: MMC / Malaysia Nursing Board / MAHPC registration, annual practising certificate,
  BLS/CPR, first aid, infection control training, fire safety training, professional indemnity insurance,
  Hepatitis B vaccination (restricted), child safeguarding / background check, custom
- job_roles from company-config.yaml; role_credential_requirements editable in Settings
- staff_credentials, credential_files, credential_verifications, credential_reminders_sent, v_credential_compliance
- cpd_activities and v_cpd_progress; CPD targets left empty unless I set them
- Constraints: expiry_date > effective_date; one pending record per employee + type
Staff (mobile, match ui-reference/mobile-my-credentials.png):
- My Credentials with ring, filter chips, status chips (Missing / Pending / Valid / Expiring soon / Expired / Rejected / Upcoming)
- Add and Renew: type, reference no., issuing body, effective date, expiry date, optional CPD points, notes,
  upload 1+ files (PDF/JPG/PNG ≤ 10 MB) from camera or files; renewal links previous_id
- Edit / withdraw only while pending; CPD tab to log activities and see progress
HR:
- Verification queue: file viewer beside entered data; Verify (record method) or Reject (reason required)
- HR can add credentials on behalf of staff
- Compliance matrix (staff × required credentials), colour-coded, PDF export
Jobs (pg_cron): credential_status_scan daily 06:00 MYT with reminders at 90/60/30/7 days and on expiry
(no duplicates); cpd_progress_scan weekly
Security: private 'credentials' bucket; uploads through an Edge Function that checks type and size;
managers see status only; restricted types visible to the staff member and HR only
Tests: RLS (staff own only, manager no files, restricted types), status at boundary dates, renewal supersede, CPD totals.
```
✅ Check
- [ ] As staff on your phone: upload a BLS cert photo with dates → shows **Pending**
- [ ] As HR: verify it → staff sees **Valid**; reject another → staff sees the reason
- [ ] Ask Claude Code to "simulate today = 30 days before expiry and run the scan" → reminder email arrives
- [ ] As manager: you see status chips but cannot open files; you cannot see vaccination records at all
- [ ] Compliance matrix PDF downloads

#### Step 7 — Announcements, policies, click-to-sign (POL-01 → POL-04)
🧑 You do: Have your PDPA notice and handbook as PDFs (drafts are fine for testing).

🤖 Prompt
```
Implement PRD 6.12 (POL-01 to POL-04) with data-model.md §3.4b and §6.
- Announcements: create (EN/MS), audience (all / branch / role), pin, schedule; read receipts; show on staff and owner home
- Policy library with versions; publishing a new version asks the audience to re-acknowledge
- Click-to-sign component reused by later steps: show the PDF, typed full name + consent tick, then record
  signer, timestamp, IP, user agent and SHA-256 of the exact PDF; stamp a signature page; store in 'signed' bucket (insert-only)
- Acknowledgement tracker per policy version with reminders (policy_ack_reminders job)
- PDPA notice acknowledgement required on every user's first login (CMP-05)
```
✅ Check
- [ ] New staff login is blocked until the PDPA notice is signed
- [ ] Publish handbook v1 → staff signs → tracker shows them signed; publish v2 → they're asked again
- [ ] The signed PDF has a signature page with name, date/time and document fingerprint

### Sprint 3 — Hiring

#### Step 8 — Hiring, offers, pre-boarding, onboarding, probation (HIR-01 → HIR-08)
🧑 You do: Paste your lawyer-reviewed offer letter and contract wording into Settings > Letter templates after this step (Claude Code builds the editor; placeholder wording is used until then).

🤖 Prompt
```
Implement PRD 6.5 (HIR-01 to HIR-08) with data-model.md §3.4.
- Job openings from company-config.yaml roles; candidate pipeline board (Applied → Interview → Offer → Hired / Rejected) with CV upload
- Letter templates (offer, contract, confirmation, extension) in EN and MS with merge fields; PDF via Edge Function;
  placeholder contract wording includes the Employment Act minimum terms in payroll-rules.md §5, §6, §11 and is clearly marked DRAFT
- Offer sent by email with a signed single-use pre-boarding link (expires in 14 days); candidate accepts with click-to-sign (Step 7)
- Pre-boarding portal (no full account): personal, statutory, bank, emergency contact, dependents, and credential uploads
  reusing Step 6 components; required credentials for the role are listed
- "Convert to employee": creates employee, employment_record, credentials, leave balances (empty until Step 9),
  onboarding_tasks checklist, user invite; sets the setup checklist's first hire date if this is the first employee
- Probation: reminders to manager 30/14/7 days before end; review form; Owner approval; confirmation or extension letter
```
✅ Check
- [ ] Send an offer to your own second email → accept on your phone → complete pre-boarding with a cert upload
- [ ] Convert → the person appears in People with credentials **Pending** and an onboarding checklist
- [ ] Set a test probation end date 30 days out → manager reminder arrives; completing the review generates a confirmation letter

**🚩 Gate: Steps 1–8 complete, migrations pushed to cloud, before you send a real offer letter.**

### Sprint 4 — Time

#### Step 9 — Leave (LVE-01 → LVE-06)
🤖 Prompt
```
Implement PRD 6.6 with data-model.md §3.5 and payroll-rules.md §6, using leave_policy in company-config.yaml.
- Seed statutory leave types and policies as the floor; company entitlements may only be higher (block lower values)
- Entitlement by years of service, pro-rated for joiners; carry-forward with expiry; yearly rollover job
- Public holidays for my state + federal for 2026 and 2027; replacement day when a holiday falls on a rest day
- Apply (mobile) → manager approval → balance update; medical certificate upload for sick leave; unpaid leave creates a payroll_input
- Team calendar with clash warnings; "Who's out" card on owner home (ui-reference/desktop-owner-home.png)
Tests: entitlement at 1y364d vs 2y; pro-rating; replacement holiday; balance never negative without HR override.
```
✅ Check
- [ ] A staff member who joined mid-year sees a pro-rated balance
- [ ] Apply → manager approves on phone → balance drops; Who's out updates
- [ ] Try to set annual leave below the Employment Act minimum in settings → blocked

#### Step 10 — Clinical roster, attendance, OT (ATT-01 → ATT-05)
🤖 Prompt
```
Implement PRD 6.7 with data-model.md §3.6 and payroll-rules.md §5, using work_pattern in company-config.yaml.
- Clock in/out on the PWA with geofence check against the branch; optional selfie; outside the fence = allowed with a reason
- Roster builder (week view) by staff and room/service; copy last week; publish notifies staff; staff see "Today's shift"
- Roster checks: leave clash, 45 h/week cap, and credential status from v_credential_compliance
  (soft = warning, hard = block for roles with blocks_roster) per company setting
- OT request + approval; calc_ot() Postgres function implementing every rate in payroll-rules.md §5,
  including the Employment Act wage-threshold rule (threshold read from a settings table, not hard-coded)
- Alerts for > 45 h/week and > monthly OT limit; approved OT creates payroll_inputs
Tests: every row of the OT rate table; geofence inside/outside.
```
✅ Check
- [ ] At the centre, Clock in shows "At the centre"; at home it asks for a reason
- [ ] Rostering a therapist with an expired BLS shows a warning
- [ ] Approve 4 h OT on a normal day → the calculated amount matches 1.5 × hourly rate × 4 (check with a calculator)

#### Step 11 — Claims (CLM-01)
🤖 Prompt
```
Implement PRD 6.8 with data-model.md §3.7, seeding claim_types from company-config.yaml.
Claim on mobile with receipt photo, monthly and per-claim limits, mileage calculator (rate per km in settings),
approval, and approved claims creating payroll_inputs (taxable or non-taxable by type).
```
✅ Check
- [ ] Submit a claim with a receipt photo from your phone → approve → it appears as a pending payroll item
- [ ] A claim above the monthly limit is blocked with a clear message

### Sprint 5 — Pay

#### Step 12 — Bank-agnostic payments setup (PAY-10, part 1)
🤖 Prompt
```
Implement the bank parts of PRD PAY-10 with data-model.md (banks, bank_file_formats, company_bank_accounts).
- Seed Malaysian banks (code, name, SWIFT, IBG code) and a GENERIC_CSV format with configurable column mapping
- Settings > Company bank accounts (Owner only): add any bank, set default, retire (never delete); masked account numbers
- Adapter interface generateBankFile(run, companyAccount, lines) -> file, with GENERIC_CSV implemented and unit-tested
- Leave a clear folder and README for adding one adapter per bank later
```
✅ Check
- [ ] Add your company bank account and set it as default; it shows masked
- [ ] Only the Owner role can see the edit buttons

#### Step 13 — Statutory reference data (you + accountant)
🧑 You do (with your accountant):
1. Download the official tables in `payroll-rules.md` §14 (KWSP Third Schedule, PERKESO SOCSO/EIS schedules, LHDN MTD specification for the payroll year, Minimum Wages Order).
2. Resolve every ⚠ VERIFY item in `payroll-rules.md` and edit the file.
3. Fill in expected values for golden tests TC01–TC14 (§12) using the official calculators.
4. Save the downloaded tables (CSV or PDF) in a new `/reference` folder in the repo.

🤖 Prompt
```
Using the official tables I placed in /reference, create migrations and loaders for statutory_rate_versions,
epf_rate_bands, socso_rate_bands, eis_rate_bands, pcb_parameters, minimum_wage_rates (data-model.md §3.9).
Every row has effective dates. Write a validation script that spot-checks 20 random wage values against the
source tables and prints any mismatch. Do not invent any value: if a table is missing, stop and tell me which.
```
✅ Check
- [ ] Validation script reports 0 mismatches
- [ ] `payroll-rules.md` has no ⚠ VERIFY left that affects calculations

#### Step 14 — Payroll engine (PAY-01 → PAY-03)
🤖 Prompt
```
Implement the statutory engine in Postgres following payroll-rules.md exactly.
- Pure functions: calc_epf, calc_socso, calc_eis, calc_pcb (normal + additional remuneration),
  calc_hrd_levy, calc_prorate, calc_min_wage_check
- Wage bases driven by pay_items flags; rounding per authority inside each function
- calc_payslip(employee_id, run_id) orchestrates everything and writes payslips, payslip_lines and YTD
- Pay models: monthly, hourly, per_session and hybrid (basic + sessions); sessions entered manually for now
- pgTAP golden tests from payroll-rules.md §12 (TC01–TC14); every case must match to RM0.00
Stop and show me any failing test with inputs, your output and the expected value. Never change expected values.
```
✅ Check
- [ ] All 14 golden tests pass (ask: `Show me the golden test results as a table`)
- [ ] Your accountant spot-checks 3 cases

#### Step 15 — Payroll run, payslips, files (PAY-04 → PAY-09, PAY-10 part 2)
🤖 Prompt
```
Implement PRD 6.9 PAY-04 to PAY-10.
- Payroll run wizard: select month → pull payroll_inputs (leave, OT, claims, sessions, recurring items)
  → calculate → review screen with variance vs last month and pre-approval checks (minimum wage,
  missing statutory numbers, negative net, big variance) → approve (Owner / Payroll Approver) → lock → mark paid
- Status stepper on owner home (ui-reference/desktop-owner-home.png) with the paying account shown
- Each run picks the paying company bank account (default pre-selected); account and format frozen on lock
- Shadow mode (is_shadow): produces everything but never releases payslips to staff
- Payslip PDF in EN and MS; staff see payslips only for locked, non-shadow runs; "Latest payslip" card on staff home
- Exports: bank file via the adapter for the selected account (GENERIC_CSV until a bank adapter exists),
  KWSP file, PERKESO/EIS file, e-PCB file, journal CSV; year-end EA Form PDF and CP8D file
- Final pay calculation for leavers
Test: switch default bank, re-export an old locked run, confirm it uses its original format.
```
✅ Check
- [ ] Run a **shadow** payroll for the 8 test employees; every payslip matches your accountant's / LHDN calculator figures
- [ ] Locked run cannot be edited
- [ ] Bank CSV opens in Excel with full account numbers and correct totals (it's the real payment file, so keep it private)

🧑 You do: Ask your bank for its bulk-payment file specification, then use this prompt:
```
Add a bank file adapter for <BANK + PRODUCT> following the spec I placed in /reference/bank/.
Unit-test it against the sample file in the spec. Do not change payroll logic.
```

### Sprint 6 — Control and launch

#### Step 16 — Compliance Centre, reports, home screens (CMP-01 → CMP-05, RPT-01 → RPT-05, ESS-01 → ESS-05)
🤖 Prompt
```
Implement PRD 6.10, 6.11 and 6.13.
- Statutory deadline calendar from payroll-rules.md §13 ("Coming up" card on owner home)
- Daily red-flag scan into compliance_alerts: expired/missing mandatory credentials, CPD behind target,
  below minimum wage, missing statutory numbers, OT over limit, wages unpaid past the 7-day rule,
  leave policy below the EA floor, unsigned required policies, Malaysian headcount reaching 10 (HRD Corp)
- Compliance dashboard with score and drill-down; inspection pack export (wage, attendance, leave, credentials) for a date range
- PDPA: DPO contact on profile; data-breach incident register; "Download my data" for staff (JSON + PDF)
- Reports RPT-01 to RPT-05 with CSV/PDF export; Auditor can read
- Owner home exactly like ui-reference/desktop-owner-home.png with live data ("Needs your attention" pulls from all approval types)
- Staff home exactly like ui-reference/mobile-staff-home.png; managers get an Approvals entry on mobile
```
✅ Check
- [ ] Owner home matches the reference screen with real (test) data
- [ ] An expired credential and a missing SOCSO number both appear as red flags
- [ ] Inspection pack PDF downloads for last month

#### Step 17 — Security, PDPA and quality sweep
🤖 Prompt
```
Do a security and quality review of the whole app before go-live:
- List every table and confirm RLS is on with tests for each role in data-model.md §5; add any missing tests
- Confirm no service-role key or secret reaches the browser bundle
- Confirm every file bucket is private and every file is served by short-lived signed URL
- Rate-limit login and pre-boarding endpoints; pre-boarding tokens expire and are single-use
- Run Playwright end-to-end tests for: login, staff clock-in, leave apply/approve, credential upload/verify,
  offer → pre-boarding → convert, shadow payroll run
- Check every screen in Bahasa Malaysia for missing translations
- Lighthouse on staff mobile pages: performance and accessibility ≥ 90
Give me a short report: what you checked, what you fixed, anything I must decide.
```
✅ Check
- [ ] Report has no open "must fix" items
- [ ] All end-to-end tests pass

#### Step 18 — Deploy and go live
🧑 You do: Create a Vercel project from the GitHub repo; add the environment variables (URL, anon key, Resend key) in Vercel settings; point your domain to Vercel; set the Supabase Auth site URL and redirect URLs to your domain.

🤖 Prompt
```
Prepare production deployment:
- Run the cloud migration prompt steps and confirm cloud schema = local
- Production seed: only the tenant, branch, statutory reference data, credential types and leave types; NO test employees
- Supabase Auth: site URL and redirect URLs for <MY DOMAIN>; email templates use Resend sender from company-config.yaml
- PWA manifest name "Rakan", icons, and install prompt; confirm it installs on Android and iPhone
- Write docs/runbook.md: monthly payroll steps, how to add a bank adapter, how to restore a backup,
  what to do in a data breach (72-hour notice), who to contact
```
✅ Go-live checklist
- [ ] Employer Setup Checklist complete (KWSP, PERKESO, LHDN E-no., bank, PDPA notice, DPO)
- [ ] All ⚠ VERIFY items affecting pay resolved and signed off by your accountant
- [ ] Golden tests pass; one full shadow payroll matched externally
- [ ] Bank file test-uploaded to the bank portal (validation only, no payment)
- [ ] Every hire's mandatory credentials verified before their first clinical shift
- [ ] MFA on for Owner / HR / Payroll Approver; Supabase daily backups visible
- [ ] Staff installed the PWA, signed the PDPA notice and handbook
- [ ] First real payroll: run as shadow first, compare, then run live

---

## Part D — After the MVP (v2 order of build)

Build in this order once the MVP has run one clean payroll month. Use the same loop; each needs a short spec added to the PRD first (prompt: `Draft PRD requirements and data-model changes for <feature> in the same style as the existing specs. Do not write code.`).

1. Clinic & Therapy System integration (sessions → pay)
2. Offboarding (checklist, asset return, exit interview, CP22A)
3. Full performance management (goals, review cycles, 360)
4. Locum / contractor register and payouts
5. Incident reporting (needlestick, injury → SOCSO / DOSH)
6. Clinical supervision log
7. Consultant client / project timesheets and credential portfolio export
8. Engagement surveys / eNPS
9. Disciplinary & Domestic Inquiry, FWA requests
10. Benefits (panel clinic, GHS), HRD Corp training claims
11. Careers page, custom fields, custom report builder
12. Integrations: Xero, Google Calendar, WhatsApp (n8n), signing-provider e-signature
