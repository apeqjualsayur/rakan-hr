// Seeds the linked DEV project from _specs/hr-system/company-config.yaml (build steps 3–5):
// the tenant, its branch, an Owner membership for every email in people.owner_emails, the
// job roles from roles_to_hire, and eight made-up test employees (scripts/lib/test-people.mjs).
// Creating the tenant also creates its Employer Setup Checklist (database trigger).
// Safe to re-run. The yaml only prefills: on a re-run it fills fields that are still
// empty and never overwrites what was saved in Settings. Owners removed from the yaml are
// deactivated (is_active = false, audited), never deleted. Test employees are added once and
// never overwritten, so edits made in the app survive a re-run.
//
// Needs SUPABASE_DB_URL in .env.local. Refuses to run unless it points at the linked project
// and that project is the dev project in .env.local.

import { existsSync, readFileSync } from "node:fs";
import process from "node:process";
import pg from "pg";
import { parse } from "yaml";
import {
  ownerEmails,
  toBranch,
  toJobOpenings,
  toLeavePolicy,
  toWorkPattern,
  toJobRoles,
  toRoleRequirements,
  toTenant,
} from "./lib/company-config.mjs";
import { TEST_CREDENTIALS, testPeople } from "./lib/test-people.mjs";

// Fixed ids keep the seed idempotent across re-runs and `db:reset`.
const TENANT_ID = "5eed0000-0000-4000-8000-000000000001";
const BRANCH_ID = "5eed0000-0000-4000-8000-000000000002";

function fail(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const dbUrl = process.env.SUPABASE_DB_URL;
const appUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const refFile = "supabase/.temp/project-ref";
if (!dbUrl) fail("SUPABASE_DB_URL is empty in .env.local (see .env.example).");
if (!existsSync(refFile))
  fail("No linked project. Run: npm run db:link -- <dev project ref>");
const linkedRef = readFileSync(refFile, "utf8").trim();
if (!dbUrl.includes(linkedRef) || !appUrl.includes(linkedRef)) {
  fail(
    `Not seeding: .env.local and the CLI link (${linkedRef}) must both point at the dev project.`,
  );
}

let config,
  tenant,
  branch,
  owners,
  jobRoles,
  requirements,
  openings,
  workPattern,
  leave;
try {
  config = parse(readFileSync("_specs/hr-system/company-config.yaml", "utf8"));
  tenant = toTenant(config);
  branch = toBranch(config);
  owners = ownerEmails(config);
  jobRoles = toJobRoles(config);
  requirements = toRoleRequirements(config);
  openings = toJobOpenings(config);
  workPattern = toWorkPattern(config);
  leave = toLeavePolicy(config);
} catch (error) {
  fail(error.message);
}

const columns = (row) => Object.keys(row);
// Insert, or fill only the columns that are still empty (null, or {} for jsonb).
function prefill(table, id, row) {
  const cols = columns(row);
  const keep = (c) =>
    c === "operating_hours"
      ? `${c} = case when ${table}.${c} = '{}'::jsonb then excluded.${c} else ${table}.${c} end`
      : `${c} = coalesce(${table}.${c}, excluded.${c})`;
  return {
    text: `insert into public.${table} (id, ${cols.join(", ")})
           values ($1, ${cols.map((_, i) => `$${i + 2}`).join(", ")})
           on conflict (id) do update set ${cols.map(keep).join(", ")}`,
    values: [id, ...cols.map((c) => row[c])],
  };
}

console.log(`→ Seeding dev project ${linkedRef} from company-config.yaml`);

const client = new pg.Client({
  connectionString: dbUrl,
  // Supabase's certificate is signed by its own CA, which Node does not ship. Dev project only.
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();
  await client.query("begin");
  await client.query(prefill("tenants", TENANT_ID, tenant));
  await client.query(
    prefill("branches", BRANCH_ID, { tenant_id: TENANT_ID, ...branch }),
  );

  for (const email of owners) {
    await client.query(
      `insert into public.memberships (tenant_id, invited_email, role, is_active)
       values ($1, $2, 'owner', true)
       on conflict (tenant_id, invited_email)
       do update set role = 'owner', is_active = true`,
      [TENANT_ID, email],
    );
  }
  const removed = await client.query(
    `update public.memberships set is_active = false
     where tenant_id = $1 and role = 'owner' and is_active
       and (invited_email is null or invited_email <> all ($2::text[]))
     returning invited_email`,
    [TENANT_ID, owners],
  );

  const active = await client.query(
    `select invited_email, user_id is not null as signed_up from public.memberships
     where tenant_id = $1 and role = 'owner' and is_active order by invited_email`,
    [TENANT_ID],
  );
  if (active.rowCount === 0)
    throw new Error("Refusing to leave the company with no active Owner.");

  for (const role of jobRoles) {
    await client.query(
      `insert into public.job_roles (tenant_id, name, is_clinical, sort_order)
       values ($1, $2, $3, $4)
       on conflict (tenant_id, name) do nothing`,
      [TENANT_ID, role.name, role.is_clinical, role.sort_order],
    );
  }
  const roleIds = new Map(
    (
      await client.query(
        `select id, name from public.job_roles where tenant_id = $1`,
        [TENANT_ID],
      )
    ).rows.map((r) => [r.name, r.id]),
  );
  // Step 6: credential requirements per role, added once (Settings > Credentials edits them).
  let requirementsAdded = 0;
  for (const r of requirements) {
    const res = await client.query(
      `insert into public.role_credential_requirements
         (job_role_id, credential_type_id, requirement, blocks_roster)
       select $1, t.id, $3, $4 from public.credential_types t
       where t.tenant_id = $5 and t.code = $2
       on conflict (job_role_id, credential_type_id) do nothing`,
      [roleIds.get(r.role), r.code, r.requirement, r.blocks_roster, TENANT_ID],
    );
    requirementsAdded += res.rowCount;
  }
  // Step 8: an open job opening per role, added once (Hiring > Job openings edits them).
  let openingsAdded = 0;
  for (const o of openings) {
    const res = await client.query(
      `insert into public.job_openings
         (tenant_id, job_role_id, title, employment_type, pay_model, status, notes)
       select $1, $2, $3, $4, $5, 'open', $6
       where not exists (
         select 1 from public.job_openings where tenant_id = $1 and title = $3
       )`,
      [
        TENANT_ID,
        roleIds.get(o.role),
        o.title,
        o.employment_type,
        o.pay_model,
        o.headcount ? `Headcount: ${o.headcount} (company-config.yaml)` : null,
      ],
    );
    openingsAdded += res.rowCount;
  }
  // Step 9: work pattern (only while still the default) and leave policies. Floor rows
  // seeded by the database are raised to company-config.yaml once; changes made later in
  // Settings > Leave are kept.
  await client.query(
    `update public.tenants set rest_day = $2, off_days = $3, half_days = $4
     where id = $1 and off_days = '{}' and half_days = '{}' and rest_day = 0`,
    [
      TENANT_ID,
      workPattern.rest_day,
      workPattern.off_days,
      workPattern.half_days,
    ],
  );
  // Step 10: normal hours a day (only while still the default).
  await client.query(
    `update public.tenants set normal_hours_per_day = $2 where id = $1 and normal_hours_per_day = 8`,
    [TENANT_ID, workPattern.normal_hours_per_day],
  );
  for (const t of leave.extraTypes) {
    await client.query(
      `insert into public.leave_types (tenant_id, code, name_en, name_ms, sort_order)
       values ($1, $2, $3, $4, 70) on conflict (tenant_id, code) do nothing`,
      [TENANT_ID, t.code, t.name_en, t.name_ms],
    );
  }
  let policiesRaised = 0;
  for (const p of leave.policies) {
    const res = await client.query(
      `update public.leave_policies lp
       set days_per_year = $3, carry_forward_max = $5, carry_forward_expiry_months = $6
       from public.leave_types t
       where lp.leave_type_id = t.id and t.tenant_id = $1 and t.code = $2
         and lp.min_service_months = $4
         and lp.days_per_year = (select m.days from public.statutory_leave_minimums m
                                 where m.leave_code = t.code and m.min_service_months = lp.min_service_months
                                 order by m.effective_from desc limit 1)
         and lp.carry_forward_max = 0`,
      [
        TENANT_ID,
        p.code,
        p.days_per_year,
        p.min_service_months,
        p.carry_forward_max,
        p.carry_forward_expiry_months,
      ],
    );
    policiesRaised += res.rowCount;
  }
  const seededPeople = await seedTestPeople(client, roleIds, owners[0]);
  const seededCredentials = await seedTestCredentials(client);
  await client.query("commit");

  const saved = await client.query(
    `select to_jsonb(t) as row from public.tenants t where id = $1`,
    [TENANT_ID],
  );
  const unknown = Object.keys(tenant).filter(
    (k) => saved.rows[0].row[k] === null,
  );
  console.log(
    `✔ Tenant and branch saved; empty fields filled from the yaml (still blank: ${unknown.join(", ") || "none"})`,
  );
  for (const row of active.rows) {
    console.log(
      `✔ Owner: ${row.invited_email}${row.signed_up ? "" : " (invited; links on first sign-in)"}`,
    );
  }
  for (const row of removed.rows)
    console.log(`✔ Owner deactivated: ${row.invited_email ?? "(no email)"}`);
  console.log(
    `✔ Job roles: ${jobRoles.map((r) => r.name).join(", ") || "none in the yaml"}`,
  );
  console.log(
    `✔ Credential requirements: ${requirementsAdded} added (${requirements.length} in the yaml)`,
  );
  console.log(
    `✔ Job openings: ${openingsAdded} added (${openings.length} roles in the yaml)`,
  );
  console.log(
    `✔ Leave: ${policiesRaised} policy bands set from the yaml; extra types: ${leave.extraTypes.map((t) => t.code).join(", ") || "none"}`,
  );
  console.log(`✔ Test credentials: ${seededCredentials} added`);
  console.log(
    `✔ Test employees: ${seededPeople.added} added, ${seededPeople.kept} already there` +
      (seededPeople.skipped.length
        ? ` (skipped, role not in the yaml: ${seededPeople.skipped.join(", ")})`
        : ""),
  );
} catch (error) {
  await client.query("rollback").catch(() => {});
  fail(`Seed failed: ${error.message}`);
} finally {
  await client.end().catch(() => {});
}

// Dev-only fake people (fake IC and bank numbers). Inserted once by fixed id; a re-run
// leaves existing rows alone. The database encrypts the IC and account numbers.
async function seedTestPeople(client, roleIds, ownerEmail) {
  const people = testPeople(ownerEmail).filter((p) => roleIds.has(p.role));
  const skipped = testPeople(ownerEmail)
    .filter((p) => !roleIds.has(p.role))
    .map((p) => p.full_name);
  const [{ count }] = (
    await client.query(
      `select count(*)::int from public.employees where id = any ($1::uuid[])`,
      [people.map((p) => p.id)],
    )
  ).rows;

  // Insert without managers first so the reporting lines can point at anyone.
  for (const p of people) {
    await client.query(
      `insert into public.employees
         (id, tenant_id, full_name, id_type, id_no, nationality, date_of_birth, gender,
          marital_status, religion, pcb_category, spouse_working, children_count_eligible,
          work_email, phone, status, branch_id, job_role_id, job_title, emergency_contact)
       values ($1, $2, $3, 'mykad', $4, 'MY', $5, $6, $7, $8, $9, $10, $11, $12, $13,
               'active', $14, $15, $16, $17)
       on conflict (id) do nothing`,
      [
        p.id,
        TENANT_ID,
        p.full_name,
        p.id_no,
        p.date_of_birth,
        p.gender,
        p.marital_status,
        p.religion ?? null,
        p.pcb_category,
        p.pcb_category === "married_spouse_working"
          ? true
          : p.pcb_category === "married_spouse_not_working"
            ? false
            : null,
        p.children_count_eligible ?? 0,
        p.work_email,
        p.phone,
        BRANCH_ID,
        roleIds.get(p.role),
        p.job_title,
        JSON.stringify({}),
      ],
    );
  }
  for (const p of people) {
    if (!p.manager_id) continue;
    await client.query(
      `update public.employees set manager_id = $2
       where id = $1 and manager_id is null
         and exists (select 1 from public.employees m where m.id = $2)`,
      [p.id, p.manager_id],
    );
  }

  for (const [index, p] of people.entries()) {
    const c = p.contract;
    await client.query(
      `insert into public.employment_records
         (id, employee_id, employment_type, pay_model, basic_salary, hourly_rate,
          session_rate, normal_hours_per_day, work_days_per_week, start_date, end_date,
          probation_end)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       on conflict (id) do nothing`,
      [
        seedId(201 + index),
        p.id,
        c.employment_type,
        c.pay_model,
        c.basic_salary ?? null,
        c.hourly_rate ?? null,
        c.session_rate ?? null,
        c.normal_hours_per_day ??
          config.work_pattern?.normal_hours_per_day ??
          null,
        c.work_days_per_week ?? config.work_pattern?.work_days_per_week ?? null,
        c.start_date,
        c.end_date ?? null,
        c.probation_end ?? null,
      ],
    );
    await client.query(
      `insert into public.bank_accounts
         (id, employee_id, bank_code, account_no, holder_name, is_primary, status)
       values ($1, $2, $3, $4, $5, true, 'active')
       on conflict (id) do nothing`,
      [
        seedId(301 + index),
        p.id,
        p.bank.bank_code,
        p.bank.account_no,
        p.bank.holder_name,
      ],
    );
    for (const [n, d] of (p.dependents ?? []).entries()) {
      await client.query(
        `insert into public.dependents (id, employee_id, name, relationship, date_of_birth)
         values ($1, $2, $3, $4, $5)
         on conflict (id) do nothing`,
        [
          seedId(400 + index * 10 + n),
          p.id,
          d.name,
          d.relationship,
          d.date_of_birth,
        ],
      );
    }
  }
  return { added: people.length - count, kept: count, skipped };
}

function seedId(n) {
  return `5eed0000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

// Dev-only demo credentials (Step 6): verified records without files, dated relative to
// today. Each is added once (fixed id) and then left alone.
async function seedTestCredentials(client) {
  const people = new Map(testPeople("").map((p) => [p.slug, p.id]));
  let added = 0;
  for (const [index, [slug, code, from, to]] of TEST_CREDENTIALS.entries()) {
    const res = await client.query(
      `insert into public.staff_credentials
         (id, employee_id, credential_type_id, reference_no, effective_date, expiry_date,
          status, submitted_at, verified_at, verify_method)
       select $1, $2, t.id, $3, current_date + $4::int, current_date + $5::int,
              'verified', now(), now(), 'Seeded test data'
       from public.credential_types t
       where t.tenant_id = $6 and t.code = $7
         and exists (select 1 from public.employees e where e.id = $2)
       on conflict (id) do nothing`,
      [
        seedId(501 + index),
        people.get(slug),
        `TEST-${code}-${index + 1}`,
        from,
        to,
        TENANT_ID,
        code,
      ],
    );
    added += res.rowCount;
  }
  return added;
}
