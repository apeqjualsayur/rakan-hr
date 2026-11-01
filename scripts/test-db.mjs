// Runs the pgTAP tests in supabase/tests/ against the linked cloud dev project, without Docker.
// (`supabase test db` runs pg_prove inside a Docker container, so it is not used here.)
//
// Needs SUPABASE_DB_URL in .env.local and a linked project (`npm run db:link -- <ref>`).
// Refuses to run unless the connection string points at the linked project.
// Each test file runs inside begin … rollback, so nothing it creates is kept.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import pg from "pg";

const root = process.cwd();
const testsDir = path.join(root, "supabase", "tests");
const refFile = path.join(root, "supabase", ".temp", "project-ref");

function fail(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

if (existsSync(path.join(root, ".env.local")))
  process.loadEnvFile(".env.local");

const dbUrl = process.env.SUPABASE_DB_URL;
if (!dbUrl) fail("SUPABASE_DB_URL is empty in .env.local (see .env.example).");
if (!existsSync(refFile))
  fail("No linked project. Run: npm run db:link -- <dev project ref>");

const linkedRef = readFileSync(refFile, "utf8").trim();
if (!dbUrl.includes(linkedRef))
  fail(
    `SUPABASE_DB_URL does not point at the linked project (${linkedRef}). Not running.`,
  );

const files = readdirSync(testsDir, { recursive: true })
  .filter((f) => f.endsWith(".sql"))
  .sort();
if (files.length === 0) {
  console.log("No pgTAP test files found in supabase/tests/.");
  process.exit(0);
}

console.log(
  `Running ${files.length} pgTAP file(s) on linked project ${linkedRef}\n`,
);

const client = new pg.Client({
  connectionString: dbUrl,
  // Supabase's certificate is signed by its own CA, which Node does not ship.
  // The connection is still encrypted. Dev project only, holding fake data.
  ssl: { rejectUnauthorized: false },
});

let failedFiles = 0;
try {
  await client.connect();
  for (const file of files) {
    const sql = readFileSync(path.join(testsDir, file), "utf8");
    const lines = [];
    try {
      const results = await client.query(sql);
      for (const result of [results].flat()) {
        for (const row of result.rows ?? []) {
          const value = Object.values(row)[0];
          if (typeof value === "string") lines.push(...value.split("\n"));
        }
      }
    } catch (error) {
      lines.push(`not ok - SQL error: ${error.message}`);
    } finally {
      await client.query("rollback").catch(() => {});
    }

    const planned = Number(
      lines.find((l) => /^1\.\.\d+$/.test(l))?.slice(3) ?? NaN,
    );
    const passed = lines.filter((l) => /^ok \d+/.test(l)).length;
    const failed = lines.filter((l) => l.startsWith("not ok")).length;
    const ok = failed === 0 && passed === planned;
    if (!ok) failedFiles++;

    console.log(
      `${ok ? "✔" : "✖"} ${file}  (${passed}/${Number.isNaN(planned) ? "?" : planned} passed)`,
    );
    if (!ok) for (const l of lines) console.log(`    ${l}`);
  }
} catch (error) {
  fail(`Could not connect to the dev database: ${error.message}`);
} finally {
  await client.end().catch(() => {});
}

console.log(
  failedFiles === 0
    ? "\nAll database tests passed."
    : `\n${failedFiles} file(s) failed.`,
);
process.exit(failedFiles === 0 ? 0 : 1);
