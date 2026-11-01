// Connects notifications to email on the linked DEV project (build step 3, FND-07):
// 1. stores the Edge Function URL and a shared webhook secret in Supabase Vault, which the
//    notifications_queue_email trigger reads;
// 2. sets the Edge Function's secrets (NOTIFY_WEBHOOK_SECRET, RESEND_API_KEY, EMAIL_FROM,
//    APP_URL) from .env.local, via a temporary file that is deleted straight away.
// Safe to re-run: an existing webhook secret is reused. No secret is printed.

import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import pg from "pg";

function fail(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const env = process.env;
const linkedRef = readFileSync("supabase/.temp/project-ref", "utf8").trim();
const appProjectUrl = env.NEXT_PUBLIC_SUPABASE_URL ?? "";
if (
  !env.SUPABASE_DB_URL?.includes(linkedRef) ||
  !appProjectUrl.includes(linkedRef)
) {
  fail(
    `.env.local and the CLI link (${linkedRef}) must both point at the dev project.`,
  );
}
if (!env.RESEND_API_KEY)
  fail("RESEND_API_KEY is empty in .env.local (see .env.example).");

const functionUrl = `${appProjectUrl.replace(/\/$/, "")}/functions/v1/send-notification-email`;

const client = new pg.Client({
  connectionString: env.SUPABASE_DB_URL,
  // Supabase's certificate is signed by its own CA, which Node does not ship. Dev project only.
  ssl: { rejectUnauthorized: false },
});

async function upsertVaultSecret(name, value) {
  const existing = await client.query(
    "select id from vault.secrets where name = $1",
    [name],
  );
  if (existing.rowCount) {
    await client.query("select vault.update_secret($1, $2)", [
      existing.rows[0].id,
      value,
    ]);
  } else {
    await client.query("select vault.create_secret($1, $2)", [value, name]);
  }
}

let webhookSecret;
try {
  await client.connect();
  const current = await client.query(
    "select decrypted_secret from vault.decrypted_secrets where name = 'notify_webhook_secret'",
  );
  webhookSecret =
    current.rows[0]?.decrypted_secret ?? randomBytes(32).toString("hex");
  await upsertVaultSecret("notify_webhook_secret", webhookSecret);
  await upsertVaultSecret("notify_function_url", functionUrl);
  console.log("✔ Vault: notify_function_url and notify_webhook_secret saved");
} catch (error) {
  fail(`Could not save Vault secrets: ${error.message}`);
} finally {
  await client.end().catch(() => {});
}

const dir = mkdtempSync(path.join(tmpdir(), "rakan-secrets-"));
const file = path.join(dir, "function.env");
try {
  writeFileSync(
    file,
    [
      `NOTIFY_WEBHOOK_SECRET=${webhookSecret}`,
      `RESEND_API_KEY=${env.RESEND_API_KEY}`,
      `EMAIL_FROM=${env.EMAIL_FROM ?? ""}`,
      `APP_URL=${env.APP_URL || "http://localhost:3002"}`,
    ].join("\n") + "\n",
    { mode: 0o600 },
  );
  const result = spawnSync(
    "npx",
    ["supabase", "secrets", "set", "--env-file", file],
    {
      stdio: "inherit",
      shell: process.platform === "win32",
    },
  );
  if (result.status !== 0)
    fail("supabase secrets set failed (are you logged in? npx supabase login)");
  console.log("✔ Edge Function secrets set");
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log(
  "\nNext: npm run functions:deploy -- send-notification-email --no-verify-jwt",
);
