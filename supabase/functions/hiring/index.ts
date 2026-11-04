// Hiring documents (HIR-03, HIR-04, HIR-07, HIR-08): renders letters from the letter
// templates as PDFs, sends offers with a single-use pre-boarding link, stores a candidate's
// signed offer, and writes probation letters. Three kinds of caller:
//
// 1. Owner / HR admin (Authorization: Bearer <their token>): preview_offer, send_offer,
//    resend_link, preview_template. The database functions check the role as that user.
// 2. A candidate's pre-boarding session (x-preboarding-session, sent by the app's server):
//    offer_url, sign_offer. Candidates have no account; the session is checked by the
//    preboarding_* database functions.
// 3. The database (x-webhook-secret, from queue_probation_letter()): probation_letter.
//
// Files are written with the service role: `letters` (offers), `signed` (the candidate's
// signed copy, never overwritten) and `documents` (probation letters). Deployed with
// --no-verify-jwt; every action checks its caller itself.
//
// Secrets: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY (provided), and
// NOTIFY_WEBHOOK_SECRET, RESEND_API_KEY, EMAIL_FROM, APP_URL (npm run notify:setup).

import {
  createClient,
  type SupabaseClient,
} from "npm:@supabase/supabase-js@2.118.0";
import { sendEmail } from "../_shared/emails/send.ts";
import { buildEmail } from "../_shared/emails/templates.tsx";
import {
  fillTemplate,
  type LetterKind,
  type LetterLocale,
  letterDate,
  malaysiaDate,
  offerValues,
  type OfferTerms,
  probationValues,
  sampleValues,
} from "../_shared/letters/merge.ts";
import {
  appendSignaturePage,
  renderLetters,
  sha256Hex,
} from "../_shared/letters/pdf.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

const pdfResponse = (bytes: Uint8Array) =>
  new Response(bytes, {
    status: 200,
    headers: { ...cors, "Content-Type": "application/pdf" },
  });

function sameSecret(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** A database refusal as { error: hint } (the hint names the reason, e.g. "offer_not_draft"). */
function refused(error: {
  code?: string;
  hint?: string | null;
  message: string;
}) {
  const status =
    error.code === "42501" ? 403 : error.code === "P0002" ? 404 : 409;
  return json(status, { error: error.hint || error.code || "failed" });
}

/** 32 random bytes as URL-safe text, and the SHA-256 the database stores instead. */
async function newToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return { token, hash: await sha256Hex(new TextEncoder().encode(token)) };
}

const appUrl = () =>
  (Deno.env.get("APP_URL") || "http://localhost:3002").replace(/\/$/, "");

type Admin = SupabaseClient;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const body = await req.json().catch(() => ({}));
  const action = typeof body.action === "string" ? body.action : "";

  // 3. The database.
  const webhook = req.headers.get("x-webhook-secret");
  if (webhook !== null) {
    const secret = Deno.env.get("NOTIFY_WEBHOOK_SECRET") ?? "";
    if (!secret || !sameSecret(webhook, secret))
      return json(401, { error: "unauthorised" });
    if (action === "probation_letter" && UUID.test(String(body.review_id)))
      return probationLetter(admin, String(body.review_id));
    return json(400, { error: "bad_request" });
  }

  // 2. A candidate's pre-boarding session.
  const session = req.headers.get("x-preboarding-session");
  if (session !== null) {
    const anon = createClient(url, anonKey, {
      auth: { persistSession: false },
    });
    if (action === "offer_url") return offerUrl(anon, admin, session);
    if (action === "sign_offer") return signOffer(anon, admin, session, body);
    return json(400, { error: "bad_request" });
  }

  // 1. Owner / HR admin.
  const authorization = req.headers.get("Authorization") ?? "";
  if (!authorization.startsWith("Bearer "))
    return json(401, { error: "unauthorised" });
  const asUser = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const { data: who, error: whoError } = await asUser.auth.getUser(
    authorization.slice("Bearer ".length),
  );
  if (whoError || !who.user) return json(401, { error: "unauthorised" });

  if (action === "preview_template") return previewTemplate(asUser, body);
  if (!UUID.test(String(body.offer_id)))
    return json(400, { error: "bad_request" });
  const offerId = String(body.offer_id);
  if (action === "preview_offer") return previewOffer(asUser, offerId);
  if (action === "send_offer") return sendOffer(asUser, admin, offerId);
  if (action === "resend_link") return resendLink(asUser, offerId);
  return json(400, { error: "bad_request" });
});

// ── Offers ──────────────────────────────────────────────────────────────────────────────

type OfferData = {
  offer: OfferTerms & {
    id: string;
    status: string;
    locale: LetterLocale;
    candidate_id: string;
    expires_at: string | null;
  };
  candidate: { id: string; full_name: string; email: string };
  company: {
    name: string | null;
    legal_name: string | null;
    reg_no: string | null;
    address: string | null;
  };
  branch_name: string | null;
  manager_name: string | null;
  templates: Partial<
    Record<LetterKind, { title: string; body: string; is_draft: boolean }>
  >;
  folder: string;
};

async function offerPdf(data: OfferData) {
  const locale = data.offer.locale;
  const today = malaysiaDate(new Date());
  const values = offerValues(
    data.offer,
    {
      name: data.candidate.full_name,
      company: data.company,
      branch_name: data.branch_name,
      manager_name: data.manager_name,
      today,
    },
    locale,
  );
  const sections = (["offer", "contract"] as const).flatMap((kind) => {
    const template = data.templates[kind];
    return template
      ? [
          {
            text: fillTemplate(template.body, values),
            draft: template.is_draft,
          },
        ]
      : [];
  });
  return renderLetters(sections, {
    companyName: values.company_name,
    locale,
    documentTitle: data.templates.offer?.title ?? "Offer",
  });
}

async function loadOffer(asUser: SupabaseClient, offerId: string) {
  const { data, error } = await asUser.rpc("offer_letter_data", {
    p_offer_id: offerId,
  });
  return { data: data as OfferData | null, error };
}

async function previewOffer(asUser: SupabaseClient, offerId: string) {
  const { data, error } = await loadOffer(asUser, offerId);
  if (error || !data)
    return refused(error ?? { message: "not found", code: "P0002" });
  return pdfResponse(await offerPdf(data));
}

async function emailOffer(data: OfferData, token: string, expiresAt: string) {
  const locale = data.offer.locale;
  const { subject, element } = buildEmail(
    "offer",
    {
      company: data.company.name ?? data.company.legal_name,
      job_title: data.offer.job_title,
      expires_on: malaysiaDate(new Date(expiresAt)),
    },
    locale,
    appUrl(),
    `/${locale}/preboarding/start?t=${encodeURIComponent(token)}`,
  );
  return sendEmail(data.candidate.email, subject, element);
}

/** Renders and stores the letter, sends the offer (database), then emails the link. */
async function sendOffer(
  asUser: SupabaseClient,
  admin: Admin,
  offerId: string,
) {
  const { data, error } = await loadOffer(asUser, offerId);
  if (error || !data)
    return refused(error ?? { message: "not found", code: "P0002" });
  if (data.offer.status !== "draft")
    return json(409, { error: "offer_not_draft" });

  const pdf = await offerPdf(data);
  const path = `${data.folder}offer-${Date.now()}.pdf`;
  const stored = await admin.storage
    .from("letters")
    .upload(path, pdf, { contentType: "application/pdf", upsert: false });
  if (stored.error) return json(500, { error: "upload_failed" });

  const { token, hash } = await newToken();
  const sent = await asUser.rpc("record_offer_sent", {
    p_offer_id: offerId,
    p_pdf_path: path,
    p_sha256: await sha256Hex(pdf),
    p_token_hash: hash,
  });
  if (sent.error) {
    await admin.storage.from("letters").remove([path]);
    return refused(sent.error);
  }
  const expiresAt = String(sent.data);
  const emailError = await emailOffer(data, token, expiresAt);
  return json(200, { expires_at: expiresAt, email_error: emailError });
}

/** A new single-use link for an open offer (lost email, new phone, expired link). */
async function resendLink(asUser: SupabaseClient, offerId: string) {
  const { data, error } = await loadOffer(asUser, offerId);
  if (error || !data)
    return refused(error ?? { message: "not found", code: "P0002" });
  const { token, hash } = await newToken();
  const issued = await asUser.rpc("issue_preboarding_link", {
    p_candidate_id: data.candidate.id,
    p_token_hash: hash,
  });
  if (issued.error) return refused(issued.error);
  const expiresAt = String(issued.data);
  const emailError = await emailOffer(data, token, expiresAt);
  return json(200, { expires_at: expiresAt, email_error: emailError });
}

/** Settings > Letter templates: the unsaved text with example values. */
async function previewTemplate(
  asUser: SupabaseClient,
  body: Record<string, unknown>,
) {
  const kind = String(body.kind) as LetterKind;
  const locale: LetterLocale = body.locale === "ms" ? "ms" : "en";
  const text = typeof body.body === "string" ? body.body.slice(0, 40000) : "";
  if (
    !["offer", "contract", "confirmation", "extension"].includes(kind) ||
    !text.trim()
  )
    return json(400, { error: "bad_request" });
  const { data: company, error } = await asUser.rpc("letter_preview_data");
  if (error || !company)
    return refused(error ?? { message: "forbidden", code: "42501" });
  const values = sampleValues(company, malaysiaDate(new Date()), locale);
  const pdf = await renderLetters(
    [{ text: fillTemplate(text, values), draft: body.is_draft !== false }],
    {
      companyName: values.company_name,
      locale,
      documentTitle: String(body.title ?? kind).slice(0, 200),
    },
  );
  return pdfResponse(pdf);
}

// ── Candidate (pre-boarding session) ────────────────────────────────────────────────────

/** 5-minute link to the offer the candidate is reading (or their signed copy). */
async function offerUrl(anon: SupabaseClient, admin: Admin, session: string) {
  const { data: path, error } = await anon.rpc("preboarding_offer_file", {
    p_session: session,
  });
  if (error) return refused(error);
  if (typeof path !== "string") return json(404, { error: "no_offer" });
  // Signed copies live at {tenant}/offer/…, sent letters at {tenant}/offers/….
  const bucket = path.split("/")[1] === "offer" ? "signed" : "letters";
  const { data } = await admin.storage.from(bucket).createSignedUrl(path, 300);
  return data
    ? json(200, { url: data.signedUrl })
    : json(404, { error: "no_offer" });
}

/** HIR-08: click-to-sign by the candidate, like POL-03 for staff. */
async function signOffer(
  anon: SupabaseClient,
  admin: Admin,
  session: string,
  body: Record<string, unknown>,
) {
  const typedName = String(body.typed_name ?? "")
    .trim()
    .slice(0, 200);
  const consent = String(body.consent_text ?? "")
    .trim()
    .slice(0, 2000);
  if (!typedName || !consent) return json(400, { error: "bad_request" });

  const { data: info, error } = await anon.rpc(
    "preboarding_offer_for_signing",
    {
      p_session: session,
    },
  );
  if (error || !info)
    return refused(error ?? { message: "not found", code: "P0002" });
  const offer = info as {
    tenant_id: string;
    offer_id: string;
    pdf_path: string;
    document_sha256: string;
    job_title: string;
    candidate_name: string;
    candidate_email: string;
    company: string | null;
  };

  const download = await admin.storage.from("letters").download(offer.pdf_path);
  if (download.error || !download.data) return json(404, { error: "no_offer" });
  const original = new Uint8Array(await download.data.arrayBuffer());
  if ((await sha256Hex(original)) !== offer.document_sha256)
    return json(409, { error: "document_changed" });

  const signatureId = crypto.randomUUID();
  const ip = String(body.ip ?? "unknown").slice(0, 100);
  const userAgent = String(body.user_agent ?? "unknown").slice(0, 500);
  const signed = await appendSignaturePage(original, {
    documentTitle: `${offer.company ?? ""} - ${offer.job_title}`.replace(
      /^ - /,
      "",
    ),
    typedName,
    email: offer.candidate_email,
    signedAt: new Date(),
    ip,
    userAgent,
    sha256: offer.document_sha256,
    signatureId,
    consent,
  });
  const path = `${offer.tenant_id}/offer/${offer.offer_id}/${signatureId}.pdf`;
  const stored = await admin.storage
    .from("signed")
    .upload(path, signed, { contentType: "application/pdf", upsert: false });
  if (stored.error) return json(500, { error: "upload_failed" });

  const accepted = await anon.rpc("preboarding_accept_offer", {
    p_session: session,
    p_signature_id: signatureId,
    p_typed_name: typedName,
    p_consent_text: consent,
    p_ip: ip,
    p_user_agent: userAgent,
  });
  if (accepted.error) {
    // Nothing refers to the copy yet, so it is not kept.
    await admin.storage.from("signed").remove([path]);
    return refused(accepted.error);
  }
  return json(200, { employee_id: accepted.data });
}

// ── Probation letters (database webhook) ────────────────────────────────────────────────

async function probationLetter(admin: Admin, reviewId: string) {
  const { data, error } = await admin.rpc("probation_letter_data", {
    p_review_id: reviewId,
  });
  if (error || !data) return json(404, { error: "review_not_found" });
  const d = data as {
    review: {
      recommendation: string;
      extend_months: number | null;
      confirmed_on: string | null;
      new_probation_end: string | null;
      status: string;
      letter_path: string | null;
    };
    employee: { full_name: string; job_title: string | null };
    company: OfferData["company"];
    template: {
      title: string;
      body: string;
      is_draft: boolean;
      locale: LetterLocale;
    } | null;
    folder: string;
  };
  if (d.review.status !== "approved" || d.review.letter_path)
    return json(200, { skipped: true });
  const fail = async (reason: string) => {
    await admin.rpc("probation_letter_stored", {
      p_review_id: reviewId,
      p_path: null,
      p_error: reason,
    });
    return json(500, { error: reason });
  };
  if (!d.template) return fail("No letter template");

  const locale = d.template.locale;
  const values = probationValues(
    {
      name: d.employee.full_name,
      job_title: d.employee.job_title,
      company: d.company,
      today: malaysiaDate(new Date()),
      confirmed_on: d.review.confirmed_on,
      extend_months: d.review.extend_months,
      new_probation_end: d.review.new_probation_end,
    },
    locale,
  );
  const pdf = await renderLetters(
    [
      {
        text: fillTemplate(d.template.body, values),
        draft: d.template.is_draft,
      },
    ],
    {
      companyName: values.company_name,
      locale,
      documentTitle: d.template.title,
    },
  );
  const path = `${d.folder}${reviewId}.pdf`;
  const stored = await admin.storage
    .from("documents")
    .upload(path, pdf, { contentType: "application/pdf", upsert: true });
  if (stored.error) return fail(`Upload failed: ${stored.error.message}`);
  const recorded = await admin.rpc("probation_letter_stored", {
    p_review_id: reviewId,
    p_path: path,
    p_error: null,
  });
  if (recorded.error) return json(500, { error: "record_failed" });
  return json(200, {
    path,
    date: letterDate(
      d.review.confirmed_on ?? d.review.new_probation_end,
      locale,
    ),
  });
}
