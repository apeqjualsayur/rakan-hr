// Deletes clock-in selfies older than 90 days (data-model.md §6, §7 selfie_purge). Called
// weekly by pg_cron through queue_selfie_purge() with the shared x-webhook-secret; never by
// browsers. Storage files can only be removed through the Storage API, so the database
// lists them (selfies_to_purge) and clears the paths after (selfies_purged).
//
// Deployed with --no-verify-jwt. Secrets: NOTIFY_WEBHOOK_SECRET (npm run notify:setup);
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.

import { createClient } from "npm:@supabase/supabase-js@2.118.0";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

function sameSecret(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  const secret = Deno.env.get("NOTIFY_WEBHOOK_SECRET") ?? "";
  if (!secret || !sameSecret(req.headers.get("x-webhook-secret") ?? "", secret))
    return json(401, { error: "unauthorised" });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
  const { data, error } = await admin.rpc("selfies_to_purge", { p_days: 90 });
  if (error) return json(500, { error: "list_failed" });
  const rows = (data ?? []) as { log_id: string; selfie_path: string }[];
  if (rows.length === 0) return json(200, { purged: 0 });

  const removed = await admin.storage
    .from("selfies")
    .remove(rows.map((r) => r.selfie_path));
  if (removed.error) return json(500, { error: "remove_failed" });
  await admin.rpc("selfies_purged", { p_log_ids: rows.map((r) => r.log_id) });
  return json(200, { purged: rows.length });
});
