// Seeds the linked DEV project from _specs/hr-system/company-config.yaml (build steps 3–4):
// the tenant, its branch, and an Owner membership for every email in people.owner_emails.
// Creating the tenant also creates its Employer Setup Checklist (database trigger).
// Safe to re-run. The yaml only prefills: on a re-run it fills fields that are still
// empty and never overwrites what was saved in Settings. Owners removed from the yaml are
// deactivated (is_active = false, audited), never deleted.
//
// Needs SUPABASE_DB_URL in .env.local. Refuses to run unless it points at the linked project
// and that project is the dev project in .env.local.

import { existsSync, readFileSync } from "node:fs";
import process from "node:process";
import pg from "pg";
import { parse } from "yaml";
import { ownerEmails, toBranch, toTenant } from "./lib/company-config.mjs";

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

let config, tenant, branch, owners;
try {
  config = parse(readFileSync("_specs/hr-system/company-config.yaml", "utf8"));
  tenant = toTenant(config);
  branch = toBranch(config);
  owners = ownerEmails(config);
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
} catch (error) {
  await client.query("rollback").catch(() => {});
  fail(`Seed failed: ${error.message}`);
} finally {
  await client.end().catch(() => {});
}
