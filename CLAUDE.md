# Rakan — instructions for Claude Code

Rakan is an HR and payroll web app for Malaysian healthcare and therapy centres. It is used internally first and is built to become multi-tenant SaaS later. The owner is not a coder: explain what you changed in plain words and stop at each step's "Done when" checks.

## Read first
All specs are in `_specs/hr-system/`:
- `PRD.md` — features and requirement IDs (FND-, ORG-, EMP-, CRD-, HIR-, LVE-, ATT-, CLM-, PAY-, CMP-, ESS-)
- `data-model.md` — tables, enums, RLS model, storage buckets, cron jobs
- `payroll-rules.md` — Malaysian statutory rules; items marked ⚠ VERIFY must not be treated as final
- `ui-system.md` + `ui-reference/*.png` — the UI system every screen must follow
- `build-order.md` — the step-by-step build plan; work on one step at a time
- `company-config.yaml` — the company's settings used to seed data; values marked TBC are unknown (never invent them)

Build only MVP scope (PRD §5.2). If a request drifts into v2 / v3 features (PRD §5.3–5.4), say so and ask before building.

## Stack
Next.js (App Router) + TypeScript + Tailwind, PWA · Supabase (Auth, Postgres + RLS, Storage, Edge Functions, pg_cron), Singapore region · shadcn/ui + lucide-react · next-intl (EN + MS).

## Non-negotiable rules
1. RLS enabled on every table; every business table has `tenant_id`.
2. Never use the service-role key in client code.
3. Money is `numeric(12,2)` in RM. Never use floats for money.
4. Statutory rates (EPF, SOCSO, EIS, PCB, minimum wage, HRD) come from versioned reference tables. Never hard-code them.
5. Payroll golden tests (`payroll-rules.md` §12) must pass. Never change an expected value to make a test pass; stop and report.
6. Locked payroll runs are immutable; corrections go into a later run.
7. Banks are not hard-wired: payment files come from per-bank adapters (PRD PAY-10).
8. All user-facing text exists in English and Bahasa Malaysia.
9. Every screen follows `ui-system.md`: tokens, components, one accent (rust) action per screen.
10. Sensitive files (credentials, IC, payslips) live in private buckets, accessed only through short-lived signed URLs.
11. The product name is "Rakan" in all copy; the logo wordmark alone is lowercase "rakan".
12. No local Docker database. Development runs against the cloud dev project `rakan-hr`; the production project `rakan-hr-prod` is created at Step 18. Push to prod only at Step 18 or when the owner asks. Before any `db push` (or reset / functions deploy), state which project the CLI is linked to.

## Working conventions
- Commit after each build step with a clear message referencing requirement IDs.
- Write migrations in `supabase/migrations/`; never edit a migration that has already been applied, add a new one.
- Add pgTAP tests for RLS and payroll logic alongside each migration.
- Every 🔒 table in data-model.md gets the audit trigger in the migration that creates it: `select audit.enable('public.<table>');`, and is added to the list in `supabase/tests/010_rls_enabled.test.sql`.
- RLS policies use the helpers `auth_tenant_id()`, `auth_role()`, `auth_employee_id()`, `is_manager_of()`. Owner / HR admin / payroll approver get no role until they pass MFA (JWT `aal2`).
- Notifications: call `public.notify(user_id, template, data, link)` from SQL (it is not callable by signed-in users). Each new template key needs text in `messages/*.json` (`Notifications.templates`) and in `supabase/functions/_shared/emails/templates.tsx`.
- Approvals: `create_approval(entity_type, entity_id, steps)` and `act_on_approval(approval_id, decision, comment)`; react to `approvals.status` changes with a trigger in the feature's own migration.

## Commands
Run from the repo root. The Supabase CLI is a project dev dependency, so `npm run db:*` works without a global install (or use `npx supabase …`). Cloud-only workflow: no Docker, no `supabase start`. The CLI is linked to the dev project `rakan-hr`, and `.env.local` points at the same project. Every `db:*` / `functions:deploy` script prints the linked project first.

| Task | Command |
|---|---|
| Link CLI to the dev project (one-off; asks for the DB password) | `npx supabase login`, then `npm run db:link -- <rakan-hr ref>` |
| Show which project the CLI is linked to | `npm run db:which` |
| Dev server (http://localhost:3002, not 3000, which another project uses; uses the dev project) | `npm run dev` |
| Unit tests (Vitest, `src/**/*.test.ts(x)`) | `npm test` (watch: `npm run test:watch`) |
| Database tests (pgTAP, `supabase/tests/*.sql`, run on the linked dev project inside a rolled-back transaction; needs `SUPABASE_DB_URL` in `.env.local`) | `npm run test:db` |
| End-to-end smoke tests (Playwright, `e2e/`; starts the dev server itself) | `npm run test:e2e` |
| Lint / type-check / format | `npm run lint` · `npm run typecheck` · `npm run format` (check only: `npm run format:check`) |
| Production build | `npm run build` |
| List migrations: local files vs applied on the linked project | `npm run db:migrations` |
| Push new migrations to the linked project (show `db:migrations` first) | `npm run db:push` |
| Seed the tenant, branch, Owners and Employer Setup Checklist from `company-config.yaml`. Re-runs only fill fields that are still empty, never overwriting what was saved in Settings; add or remove emails in `people.owner_emails`, then re-run (removed owners are deactivated) | `npm run db:seed` |
| Wipe the dev DB, re-apply all migrations, then `db:seed` (refuses unless linked to the `.env.local` dev project) | `npm run db:reset` |
| Connect notification emails: Vault secrets + Edge Function secrets from `.env.local` (`RESEND_API_KEY`, `EMAIL_FROM`, `APP_URL`) | `npm run notify:setup` |
| Deploy Edge Functions without Docker (server-side bundling) | `npm run functions:deploy` (one function: `npm run functions:deploy -- <name>`; the email function: `npm run functions:deploy -- send-notification-email --no-verify-jwt`) |

Do not use `supabase test db`: in CLI 2.122 it runs pg_prove in a Docker container. `supabase/config.toml` only configures the unused local stack; cloud Auth settings are changed in the dashboard.

Stack notes:
- Next.js 16: middleware is `src/proxy.ts`; `cacheComponents` is on. Read `AGENTS.md` and `node_modules/next/dist/docs/` before using unfamiliar Next APIs.
- Tailwind v4: design tokens live in `src/app/globals.css` (`@theme`), not in a `tailwind.config.ts`. Type scale classes: `text-display`, `text-display-sm`, `text-h2`, `text-h3`, `text-body`, `text-meta`, `text-label`, `text-stat`. Use `cn` from `@/lib/utils` (it knows these custom names).
- UI: reuse the components in `src/components/ui/` (ui-system.md §4; shadcn primitives are the lowercase files). Status colours and labels come only from `src/lib/status-styles.ts`; dates, money and masking from `src/lib/format.ts`. Browse everything at http://localhost:3002/en/design (dev only; 404 in production).
- i18n: URLs are prefixed `/en/…` and `/ms/…` (`src/i18n/routing.ts`); strings live in `messages/en.json` and `messages/ms.json`, and `npm test` fails if their keys differ.
