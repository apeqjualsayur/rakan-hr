# HR Management System — Malaysian Payroll & Employment Rules

Version: 0.1 (draft) · Date: 29 Oct 2026
Companion to `PRD.md` (PAY-*, LVE-*, ATT-*) and `data-model.md` (§3.8–3.9).

> **Read this first.** This file is a build guide, not legal or tax advice. Every rate and threshold must be loaded from the **official source tables** into the versioned reference tables (`statutory_rate_versions` etc.), never hard-coded. Items marked **⚠ VERIFY** must be checked against the official source (KWSP, PERKESO, LHDN, JTK, Federal Gazette) before go-live, and the full engine must pass a parallel run against external calculators. Have the company accountant review the first live payroll.

---

## 1. Design rules for the engine

1. **Rates are data, not code.** Each statutory table row carries `effective_from` / `effective_to`. A payroll run snapshots the `rate_version_id` it used.
2. **Use the official bracket tables**, not raw percentages, where the authority publishes one (EPF Third Schedule, SOCSO and EIS schedules). Percentages below are for understanding only.
3. **One function per statute**: `calc_epf()`, `calc_socso()`, `calc_eis()`, `calc_pcb()`, `calc_hrd_levy()`, `calc_ot()`, `calc_prorate()`. Each is pure: inputs in → amounts out. No reads of "today".
4. **Wage bases differ per statute.** Each `pay_item` has flags `is_epf_wage`, `is_socso_wage`, `is_eis_wage`, `is_pcb_taxable`, `is_hrd_wage`. Example: OT is generally excluded from the EPF wage base but included for SOCSO/EIS (**⚠ VERIFY** each item type).
5. **Rounding** follows each authority's rule (EPF rounds up to the next ringgit when computed by percentage above the table range; PCB rounds per LHDN spec). Encode rounding in the function, with a test for each.
6. **Locked runs are immutable.** Corrections = adjustment lines in a later run.

---

## 2. EPF (KWSP) — EPF Act 1991

| Employee group | Employee | Employer | Notes |
|---|---|---|---|
| Malaysian / PR, under 60, wage ≤ RM5,000 | 11% | 13% | Use Third Schedule brackets |
| Malaysian / PR, under 60, wage > RM5,000 | 11% | 12% | |
| Malaysian / PR, 60 and above | 0% | 4% | **⚠ VERIFY** current age-60+ rates |
| Non-Malaysian (valid pass), since Oct 2025 wages | 2% | 2% | each rounded up to next ringgit; domestic servants excluded |
| Non-Malaysian who became member before 1 Aug 1998 / PR | Malaysian rates | Malaysian rates | |
| Voluntary higher rate | as elected | as elected | stored per employee |

- Deadline: contribution for month M paid by the **15th of month M+1**.
- Output: EPF contribution file in the KWSP i-Akaun (Employer) upload format. **⚠ VERIFY** file spec.
- Employer registration: register with KWSP soon after hiring the first employee — **⚠ VERIFY** the exact deadline (commonly cited as within 7 days). Tracked in the Employer Setup Checklist.

## 3. SOCSO (PERKESO) — Employees' Social Security Act 1969

| Category | Who | Employee | Employer |
|---|---|---|---|
| 1 — Employment Injury + Invalidity | under 60 | ~0.5% | ~1.75% |
| 2 — Employment Injury only | 60 and above (**⚠ VERIFY** first-registration rules) | 0% | ~1.25% |
| Foreign workers | valid pass | **⚠ VERIFY** current scheme and rates | **⚠ VERIFY** |

- Use the official contribution schedule (bands), wage ceiling **RM6,000** (**⚠ VERIFY** current ceiling).
- Deadline: by the **15th** of the following month. Output: PERKESO ASSIST upload file (combined with EIS). **⚠ VERIFY** format.
- Employer registration within **30 days** of the first hire (**⚠ VERIFY**).

## 4. EIS (SIP) — Employment Insurance System Act 2017

- Employee 0.2%, employer 0.2%, via the official band table; wage ceiling RM6,000 (**⚠ VERIFY**).
- Eligible: Malaysians and PRs aged 18–60. Not foreign workers. Employees aged 57+ joining for the first time may be excluded — **⚠ VERIFY**.
- Same deadline and file as SOCSO.

## 5. Overtime, rest day, public holiday — Employment Act 1955

**Applicability:** the EA's OT / rest-day / public-holiday pay provisions apply to employees with wages **up to RM4,000/month** (and manual workers regardless of wages) — **⚠ VERIFY** current First Schedule threshold. For employees above the threshold, OT follows the contract; the system should allow a contractual OT rule per employee.

**Base rates**
- Ordinary rate of pay (ORP, daily) = monthly wage ÷ **26**
- Hourly rate of pay (HRP) = ORP ÷ normal hours per day

**Rates**

| Situation | Pay |
|---|---|
| OT on a normal working day | ≥ **1.5 × HRP** per hour |
| Work on rest day, ≤ half normal hours | **0.5 × ORP** |
| Work on rest day, > half up to full normal hours | **1 × ORP** |
| OT beyond normal hours on rest day | ≥ **2 × HRP** per hour |
| Work on public holiday, normal hours | **2 × ORP** (in addition to holiday pay for monthly-rated staff) |
| OT beyond normal hours on public holiday | ≥ **3 × HRP** per hour |

**Limits**
- Normal hours: max 8/day, **45/week**
- OT: max **104 hours/month** (**⚠ VERIFY**)
- Flag (do not block) when exceeded; record the reason.

**Payment timing**
- Wages: no later than the **7th day** after the end of the wage period.
- OT, rest-day and public-holiday pay: by the last day of the next wage period (**⚠ VERIFY**).

## 6. Leave — Employment Act 1955 minimums (seed as the floor)

| Leave | < 2 yrs service | 2–5 yrs | ≥ 5 yrs | Notes |
|---|---|---|---|---|
| Annual | 8 | 12 | 16 | pro-rated in first year and on exit |
| Sick (no hospitalisation) | 14 | 18 | 22 | |
| Hospitalisation | up to 60 days total | | | combined cap with sick leave per year (**⚠ VERIFY** aggregate rule) |
| Maternity | 98 consecutive days | | | maternity allowance eligibility rules apply (**⚠ VERIFY**) |
| Paternity | 7 consecutive days | | | married male, ≥ 12 months service, up to 5 confinements (**⚠ VERIFY**) |
| Public holidays | 11 paid days/year | | | 5 compulsory: National Day, Agong's Birthday, Ruler's Birthday / FT Day, Labour Day, Malaysia Day |

- Replacement day when a public holiday falls on a rest day.
- Part-time employees (< 70% of comparable full-time hours): benefits under the Employment (Part-Time Employees) Regulations 2010 — **⚠ VERIFY** pro-rating method for leave and holidays.

## 7. Pro-rating & deductions

- **Incomplete month** (new joiner, leaver, unpaid leave): monthly wage × (days eligible ÷ days in that calendar month). **⚠ VERIFY** EA formula vs company policy (some use working days); store the method per tenant.
- **Hourly part-timers:** hours × hourly rate; must be ≥ hourly minimum wage.
- **Per-session therapists:** sessions × session rate (+ basic if hybrid). Sessions come from manual entry in the MVP and from the Clinic & Therapy System later (`payroll_inputs.source = clinic_sessions`).
- **Allowed deductions:** only those the EA permits (statutory, advances, overpayment recovery, approved by employee in writing, etc.). The system must require a deduction reason code from an allowed list. **⚠ VERIFY** list against EA s24.

## 8. Minimum wage

| Effective | Rate | Scope |
|---|---|---|
| Current (since Feb/Aug 2025) | RM1,700/month | all employers |
| 1 June 2027 (announced, Budget 2027) | RM2,000/month | reported exemption for MSMEs with annual sales < RM50 million — **⚠ VERIFY** once gazetted |
| 1 June 2027 (announced) | RM2,500 starting minimum for semi-skilled and graduate positions | **⚠ VERIFY** scope and legal form |

- Daily and hourly minimums depend on days worked per week (published in the Order) → `minimum_wage_rates.daily_by_workdays`.
- Check runs on **basic wage** (not allowances / OT) — **⚠ VERIFY** definition.

## 9. PCB / MTD — Income Tax (Deduction from Remuneration) Rules

Implement the **LHDN computerised calculation method specification** for the payroll year exactly. Store all yearly parameters in `pcb_parameters` (tax brackets, rebates, reliefs).

Inputs per employee per month:
- Current month normal remuneration (taxable items)
- Additional remuneration (bonus, arrears, commission) → separate formula
- Year-to-date: gross, EPF (capped for relief), PCB paid, zakat paid
- Category: single / married spouse not working / married spouse working
- Number of eligible children (and disabled / tertiary education flags)
- TP1 (additional reliefs claimed through employer), TP3 (previous employer YTD for mid-year joiners)
- Zakat via salary deduction → offsets PCB
- Resident vs non-resident (non-resident = flat rate) — **⚠ VERIFY** rate

Other obligations:
- PCB paid by the **15th** of the following month via e-PCB / e-PCB Plus. **⚠ VERIFY** upload format.
- CP22 (new employee notification), CP22A (leaver), CP21 (leaving Malaysia), CP38 (additional deduction instruction from LHDN).
- Year-end: **EA Form** to every employee by end of February; **CP8D** + **Form E** to LHDN by 31 March.

## 10. HRD Corp levy — PSMB Act 2001

| Headcount (Malaysian employees) | Levy |
|---|---|
| 10 or more | 1% of monthly wages, mandatory |
| 5–9 | 0.5%, optional registration |
| below 5 | not covered |

- With a 5–10 staff plan, the company will cross the mandatory threshold at 10. The Compliance Centre should **alert when Malaysian headcount reaches 10**. **⚠ VERIFY** coverage for healthcare/therapy sector and wage definition.

## 11. Termination & final pay

- Notice period (unless contract states longer): < 2 yrs 4 weeks; 2–5 yrs 6 weeks; ≥ 5 yrs 8 weeks.
- Termination / lay-off benefits for eligible employees (≥ 12 months service): 10 / 15 / 20 days' wages per year of service (< 2 / 2–5 / ≥ 5 yrs) — **⚠ VERIFY** applicability per case.
- Final pay = pro-rated salary + OT due + unused annual leave (if policy) + benefits − allowed deductions. Must be paid on time.
- File CP22A for leavers.

## 12. Golden test cases (fill expected values before building PAY-*)

Generate expected values from **official sources**: KWSP contribution table, PERKESO contribution schedule, LHDN PCB calculator (Kalkulator PCB), and the company accountant. Store as `supabase/tests/payroll_golden.sql` (pgTAP) and fail the build if any case drifts by more than RM0.00.

| ID | Scenario | Key inputs | Expected EPF ee/er | SOCSO ee/er | EIS ee/er | PCB | Net |
|---|---|---|---|---|---|---|---|
| TC01 | Therapist, Malaysian, 28, single | basic RM3,800 | | | | | |
| TC02 | Senior therapist, married, spouse not working, 2 children | basic RM6,500 | | | | | |
| TC03 | Admin, age 61 | basic RM2,500 | | | | | |
| TC04 | Foreign worker (valid pass) | basic RM2,200 | | | | | |
| TC05 | Part-time, hourly | 80 h × RM15 | | | | | |
| TC06 | Per-session therapist, hybrid | basic RM1,700 + 60 × RM40 | | | | | |
| TC07 | Bonus month | basic RM4,000 + bonus RM4,000 | | | | | |
| TC08 | New joiner on the 16th | basic RM3,500 | | | | | |
| TC09 | 2 days unpaid leave | basic RM3,000 | | | | | |
| TC10 | OT: 4 h normal day + 8 h rest day | basic RM2,600, 8 h/day | | | | | |
| TC11 | Below minimum wage (must flag) | basic RM1,600 | — | — | — | — | flag raised |
| TC12 | Zakat via salary | basic RM5,000, zakat RM100 | | | | | |
| TC13 | Wage above SOCSO/EIS ceiling | basic RM8,000 | | | | | |
| TC14 | Leaver mid-month with leave encashment | basic RM3,200, exit 10th, 5 days AL | | | | | |

## 13. Statutory calendar (seed for Compliance Centre)

| When | What |
|---|---|
| 7th after each wage period | Salaries paid |
| 15th monthly | EPF, SOCSO, EIS, PCB, HRD levy (if registered) |
| Within 1 month of a new hire | CP22 to LHDN (**⚠ VERIFY**) |
| 30 days before leaver's exit | CP22A (**⚠ VERIFY** timing) |
| End of February | EA Forms issued to staff |
| 31 March | Form E + CP8D to LHDN |
| Rolling | Practising certificates / APC renewals (Credentials module) |

## 14. Official sources to load from

- KWSP: EPF Third Schedule contribution table, employer contribution file spec
- PERKESO: SOCSO & EIS contribution schedules, ASSIST upload spec
- LHDN: "Specification for Monthly Tax Deduction (MTD) Calculation Using Computerised Calculation Method" for the payroll year; e-PCB file spec; Kalkulator PCB
- JTK / Federal Gazette: Employment Act 1955 (as amended), Minimum Wages Order in force, Part-Time Employees Regulations 2010
- HRD Corp: levy guidelines
