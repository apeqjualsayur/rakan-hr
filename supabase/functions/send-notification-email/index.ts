// Emails one notification through Resend (FND-07). Called by the notifications_queue_email
// trigger (pg_net) after public.notify() inserts a row; never by browsers.
// Deployed with --no-verify-jwt: it checks the shared x-webhook-secret header instead.
//
// Secrets (set by `npm run notify:setup`): NOTIFY_WEBHOOK_SECRET, RESEND_API_KEY,
// EMAIL_FROM, APP_URL. SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.

import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { render } from "npm:@react-email/components@1.0.12";
import { buildEmail, type Locale } from "../_shared/emails/templates.tsx";

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
  if (
    !secret ||
    !sameSecret(req.headers.get("x-webhook-secret") ?? "", secret)
  ) {
    return json(401, { error: "unauthorised" });
  }

  const { notification_id: id } = await req.json().catch(() => ({}));
  if (typeof id !== "string")
    return json(400, { error: "notification_id required" });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const { data: n, error } = await admin
    .from("notifications")
    .select("id, user_id, tenant_id, template, data, link, emailed_at")
    .eq("id", id)
    .single();
  if (error || !n) return json(404, { error: "notification_not_found" });
  if (n.emailed_at) return json(200, { skipped: "already_emailed" });

  const fail = async (reason: string) => {
    await admin
      .from("notifications")
      .update({ email_error: reason.slice(0, 500) })
      .eq("id", id);
    return json(502, { error: reason });
  };

  const [{ data: userData }, { data: tenant }] = await Promise.all([
    admin.auth.admin.getUserById(n.user_id),
    admin
      .from("tenants")
      .select("default_locale")
      .eq("id", n.tenant_id)
      .single(),
  ]);
  const email = userData?.user?.email;
  if (!email) return fail("recipient has no email");

  const preferred =
    userData.user.user_metadata?.locale ?? tenant?.default_locale;
  const locale: Locale = preferred === "ms" ? "ms" : "en";
  const { subject, element } = buildEmail(
    n.template,
    n.data ?? {},
    locale,
    Deno.env.get("APP_URL") ?? "http://localhost:3002",
    n.link,
  );

  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) return fail("RESEND_API_KEY is not set");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: Deno.env.get("EMAIL_FROM") || "Rakan <onboarding@resend.dev>",
      to: [email],
      subject,
      html: await render(element),
      text: await render(element, { plainText: true }),
    }),
  });
  if (!res.ok) return fail(`Resend ${res.status}: ${await res.text()}`);

  await admin
    .from("notifications")
    .update({ emailed_at: new Date().toISOString(), email_error: null })
    .eq("id", id);
  return json(200, { sent: true });
});
