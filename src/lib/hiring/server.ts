import "server-only";
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { dbErrorKey } from "@/lib/people/server";
import type { ErrorKey } from "@/lib/settings/form";

// Hiring errors: the database functions name the reason in the error hint.
const HINTS: Record<string, ErrorKey> = {
  offer_not_draft: "offerNotDraft",
  offer_not_open: "offerNotOpen",
  no_open_offer: "offerNotOpen",
  offer_accepted: "offerAccepted",
  offer_not_accepted: "offerNotAccepted",
  bad_stage: "badStage",
  use_convert: "useConvert",
  already_converted: "alreadyConverted",
  session_invalid: "sessionEnded",
  review_open: "reviewOpen",
  no_probation: "noProbation",
  name_mismatch: "nameMismatch",
  already_signed: "alreadySigned",
  document_changed: "documentChanged",
  no_files: "noFiles",
  pending_exists: "pendingExists",
  no_letter: "letterFailed",
  upload_failed: "letterFailed",
  forbidden: "forbidden",
  unauthorised: "forbidden",
};

export function hintKey(hint: string | null | undefined): ErrorKey | null {
  return hint ? (HINTS[hint] ?? null) : null;
}

export function hiringErrorKey(
  error: PostgrestError,
  context: string,
): ErrorKey {
  return hintKey(error.hint) ?? dbErrorKey(error, context);
}

/**
 * Calls the `hiring` Edge Function as the signed-in user. Refusals come back as
 * { error: <hint> } with a 4xx status.
 */
export async function invokeHiring<T>(
  supabase: SupabaseClient,
  body: Record<string, unknown>,
): Promise<{ data: T } | { error: ErrorKey }> {
  const { data, error } = await supabase.functions.invoke("hiring", { body });
  if (!error) return { data: data as T };
  const response = (error as { context?: Response }).context;
  const payload = response ? await response.json().catch(() => null) : null;
  const key = hintKey(payload?.error);
  if (!key)
    console.error(
      "hiring function failed",
      body.action,
      payload ?? error.message,
    );
  return { error: key ?? "saveFailed" };
}
