// Step 7 (POL-01 → POL-04): announcement and policy forms, audiences, and the click-to-sign
// wording. Pure, so unit-tested in logic.test.ts.
import {
  done,
  isUuid,
  readText,
  type FieldErrors,
  type Parsed,
} from "@/lib/settings/form";
import { readCheckbox, readChoice } from "@/lib/people/fields";

export type Audience =
  | { type: "all" }
  | { type: "branches"; ids: string[] }
  | { type: "job_roles"; ids: string[] };

export const AUDIENCE_TYPES = ["all", "branches", "job_roles"] as const;

/** Audience radio + the chosen branches or job roles (checkboxes named audience_ids). */
export function parseAudience(
  formData: FormData,
  errors: FieldErrors,
): Audience {
  const type =
    readChoice(formData, "audience_type", AUDIENCE_TYPES, errors) ?? "all";
  if (type === "all") return { type };
  const ids = [...new Set(formData.getAll("audience_ids").filter(isUuid))];
  if (ids.length === 0) errors.audience_ids = "required";
  return { type, ids };
}

/** Policy codes Rakan knows; the PDPA notice is the one every user signs first (CMP-05). */
export const POLICY_PRESETS = [
  "PDPA_NOTICE",
  "HANDBOOK",
  "LEAVE_POLICY",
  "INFECTION_CONTROL_SOP",
  "CODE_OF_CONDUCT",
] as const;

/** "Safeguarding policy" → SAFEGUARDING_POLICY (codes group a policy's versions). */
export function policyCode(text: string) {
  return text
    .normalize("NFKD")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

export type PolicyValues = {
  code: string;
  title_en: string;
  title_ms: string;
  audience: Audience;
  requires_signature: boolean;
};

/** Publish a policy or a new version of one (POL-02). The PDF is uploaded separately. */
export function parsePolicy(formData: FormData): Parsed<PolicyValues> {
  const errors: FieldErrors = {};
  const preset = String(formData.get("code") ?? "");
  const code =
    preset === "OTHER"
      ? policyCode(String(formData.get("code_other") ?? ""))
      : policyCode(preset);
  if (code.length < 2)
    errors[preset === "OTHER" ? "code_other" : "code"] = "required";
  const title_en = readText(formData, "title_en", 200, errors);
  const title_ms = readText(formData, "title_ms", 200, errors);
  if (!title_en) errors.title_en = "required";
  if (!title_ms) errors.title_ms = "required";
  const pdpa = code === "PDPA_NOTICE";
  const audience: Audience = pdpa
    ? { type: "all" }
    : parseAudience(formData, errors);
  return done(
    {
      code,
      title_en: title_en ?? "",
      title_ms: title_ms ?? "",
      audience,
      requires_signature: pdpa || readCheckbox(formData, "requires_signature"),
    },
    errors,
  );
}

export type AnnouncementValues = {
  title_en: string;
  title_ms: string;
  body_en: string;
  body_ms: string;
  audience: Audience;
  pinned: boolean;
  publish_at: string;
};

/**
 * POL-01. publish_at comes from a datetime-local field in Malaysia time; blank = now.
 * `now` is an ISO timestamp (injectable for tests).
 */
export function parseAnnouncement(
  formData: FormData,
  now: string,
): Parsed<AnnouncementValues> {
  const errors: FieldErrors = {};
  const title_en = readText(formData, "title_en", 200, errors);
  const title_ms = readText(formData, "title_ms", 200, errors);
  if (!title_en) errors.title_en = "required";
  if (!title_ms) errors.title_ms = "required";
  const body_en = readText(formData, "body_en", 5000, errors) ?? "";
  const body_ms = readText(formData, "body_ms", 5000, errors) ?? "";
  const when = String(formData.get("publish_at") ?? "").trim();
  let publish_at = now;
  if (when !== "") {
    const parsed = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(when)
      ? new Date(`${when}:00+08:00`)
      : null;
    if (!parsed || Number.isNaN(parsed.getTime()))
      errors.publish_at = "invalidDate";
    else publish_at = parsed.toISOString();
  }
  return done(
    {
      title_en: title_en ?? "",
      title_ms: title_ms ?? "",
      body_en,
      body_ms,
      audience: parseAudience(formData, errors),
      pinned: readCheckbox(formData, "pinned"),
      publish_at,
    },
    errors,
  );
}

/** The same rule as public.same_name(): spacing and capitals don't matter. */
export function sameName(a: string, b: string) {
  const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
  return norm(a) === norm(b);
}

/** POL-03 consent wording, stored with each signature in the language it was shown in. */
export const CONSENT_TEXT = {
  en: "I have read and understood this document and I agree to it. Typing my full name is my electronic signature.",
  ms: "Saya telah membaca dan memahami dokumen ini dan saya bersetuju dengannya. Menaip nama penuh saya ialah tandatangan elektronik saya.",
} as const;

export function consentText(locale: string) {
  return locale === "ms" ? CONSENT_TEXT.ms : CONSENT_TEXT.en;
}

/** Text in the viewer's language from an _en / _ms pair. */
export function inLocale<K extends string>(
  row: Record<`${K}_en` | `${K}_ms`, string>,
  key: K,
  locale: string,
) {
  return locale === "ms" ? row[`${key}_ms`] : row[`${key}_en`];
}

/** Awaiting signature, or overdue once 7 days have passed (POL-04 tracker). */
export function ackStatus(
  signedAt: string | null,
  publishedAt: string,
  now = Date.now(),
): "signed" | "awaiting_signature" | "overdue" {
  if (signedAt) return "signed";
  return now - Date.parse(publishedAt) > 7 * 86_400_000
    ? "overdue"
    : "awaiting_signature";
}
