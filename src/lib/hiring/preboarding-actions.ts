"use server";

import { refresh } from "next/cache";
import { redirect } from "@/i18n/navigation";
import type { DraftState } from "@/lib/credentials/actions";
import { parseCredential } from "@/lib/credentials/logic";
import { malaysiaToday } from "@/lib/format";
import { parsePersonal, parseStatutory } from "@/lib/people/employee";
import { parseBankAccount, parseDependent } from "@/lib/people/records";
import { consentText } from "@/lib/policies/logic";
import type { SignResult } from "@/lib/policies/sign";
import {
  formLocale,
  isUuid,
  type ErrorKey,
  type FormState,
} from "@/lib/settings/form";
import {
  loadPreboarding,
  preboardingFunction,
  preboardingRpc,
  publicClient,
  requestInfo,
  storeSession,
} from "./preboarding";
import type { PreboardingContext } from "./types";

// HIR-04 / HIR-08 portal actions. The candidate has no account: each action passes the
// session cookie to a preboarding_* database function (or the hiring Edge Function),
// which checks it. Forms reuse the People and Credentials parsers; the emergency contact
// is part of the personal details form (EMP-01).

const failed = (message: ErrorKey): FormState => ({ status: "error", message });
const ok = (): FormState => ({ status: "saved", at: Date.now() });

export type StartState =
  | { status: "idle" }
  | {
      status: "error";
      reason: "link_invalid" | "link_used" | "link_expired" | "failed";
    };

/**
 * "Open my offer": exchanges the single-use link for a session. Done on a button press, not
 * on page load, so email scanners that open links do not use it up.
 */
export async function startPreboarding(
  _state: StartState,
  formData: FormData,
): Promise<StartState> {
  const locale = formLocale(formData);
  const token = String(formData.get("token") ?? "");
  const { data, error } = await publicClient().rpc("preboarding_redeem", {
    p_token: token,
  });
  if (error) {
    // Opened again on the same device: the session from the first time still works.
    if (
      error.hint === "link_used" &&
      typeof (await loadPreboarding()) === "object"
    )
      redirect({ href: "/preboarding", locale });
    const reason =
      error.hint === "link_used" ||
      error.hint === "link_expired" ||
      error.hint === "link_invalid"
        ? error.hint
        : "failed";
    if (reason === "failed")
      console.error("preboarding_redeem failed", error.code, error.message);
    return { status: "error", reason };
  }
  const { session, expires_at } = data as {
    session: string;
    expires_at: string;
  };
  await storeSession(session, expires_at);
  redirect({ href: "/preboarding", locale });
  return { status: "idle" };
}

/** HIR-08: accept the offer and contract by click-to-sign (same form as POL-03). */
export async function acceptOffer(
  _offerId: string,
  typedName: string,
  consented: boolean,
  locale: string,
): Promise<SignResult> {
  if (!consented) return { ok: false, error: "required" };
  if (!typedName.trim()) return { ok: false, error: "nameMismatch" };
  const { ip, userAgent } = await requestInfo();
  const result = await preboardingFunction<{ employee_id: string }>({
    action: "sign_offer",
    typed_name: typedName.trim(),
    consent_text: consentText(locale === "ms" ? "ms" : "en"),
    ip,
    user_agent: userAgent,
  });
  if ("error" in result) return { ok: false, error: result.error };
  refresh();
  return { ok: true };
}

/** 5-minute link to the offer PDF (or the signed copy once accepted). */
export async function preboardingOfferUrl(): Promise<string | null> {
  const result = await preboardingFunction<{ url: string }>({
    action: "offer_url",
  });
  return "data" in result ? result.data.url : null;
}

async function save(
  name: string,
  args: Record<string, unknown>,
): Promise<FormState> {
  const result = await preboardingRpc<null>(name, args);
  if ("error" in result) {
    if (result.error === "invalidMykad" || result.error === "duplicateId")
      return { status: "error", errors: { id_no: result.error } };
    return failed(result.error);
  }
  refresh();
  return ok();
}

export async function savePersonal(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = parsePersonal(formData, malaysiaToday());
  if (!parsed.ok) return { status: "error", errors: parsed.errors };
  // Work email and phone are set by HR later.
  const values: Partial<typeof parsed.values> = { ...parsed.values };
  delete values.work_email;
  delete values.work_phone;
  return save("preboarding_save_personal", { p_data: values });
}

export async function saveStatutory(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = parseStatutory(formData);
  if (!parsed.ok) return { status: "error", errors: parsed.errors };
  if (!parsed.values.pcb_category)
    return { status: "error", errors: { pcb_category: "required" } };
  return save("preboarding_save_statutory", { p_data: parsed.values });
}

export async function saveBank(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await loadPreboarding();
  if (typeof ctx === "string") return failed("sessionEnded");
  const parsed = parseBankAccount(
    formData,
    ctx.banks.map((b) => b.code),
  );
  if (!parsed.ok) return { status: "error", errors: parsed.errors };
  const result = await preboardingRpc<null>("preboarding_save_bank", {
    p_bank_code: parsed.values.bank_code,
    p_account_no: parsed.values.account_no,
    p_holder_name: parsed.values.holder_name,
  });
  if ("error" in result)
    return result.error === "invalidAccountNo"
      ? { status: "error", errors: { account_no: result.error } }
      : failed(result.error);
  refresh();
  return ok();
}

/** A stored dependent without its id, as the save function takes the list. */
function dependentValues(d: PreboardingContext["dependents"][number]) {
  return {
    name: d.name,
    relationship: d.relationship,
    date_of_birth: d.date_of_birth,
    is_disabled: d.is_disabled,
    in_tertiary_education: d.in_tertiary_education,
  };
}

export async function addDependent(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await loadPreboarding();
  if (typeof ctx === "string") return failed("sessionEnded");
  const parsed = parseDependent(formData, malaysiaToday());
  if (!parsed.ok) return { status: "error", errors: parsed.errors };
  return save("preboarding_save_dependents", {
    p_items: [...ctx.dependents.map(dependentValues), parsed.values],
  });
}

export async function removeDependent(id: string): Promise<FormState> {
  const ctx = await loadPreboarding();
  if (typeof ctx === "string" || !isUuid(id)) return failed("sessionEnded");
  return save("preboarding_save_dependents", {
    p_items: ctx.dependents.filter((d) => d.id !== id).map(dependentValues),
  });
}

// ── Credentials: the Step 6 form, in pre-boarding mode ──

export async function savePreboardingCredential(
  _state: DraftState,
  formData: FormData,
): Promise<DraftState> {
  const ctx = await loadPreboarding();
  if (typeof ctx === "string") return failed("sessionEnded");
  const parsed = parseCredential(formData, ctx.types);
  if (!parsed.ok) return { status: "error", errors: parsed.errors };
  const id = formData.get("credential_id");
  const result = await preboardingRpc<string>("preboarding_save_credential", {
    p_credential_id: isUuid(id) ? id : null,
    p_data: parsed.values,
  });
  if ("error" in result) return failed(result.error);
  return { status: "draft", id: result.data, at: Date.now() };
}

export async function submitPreboardingCredential(
  id: string,
): Promise<FormState> {
  if (!isUuid(id)) return failed("forbidden");
  return save("preboarding_submit_credential", { p_credential_id: id });
}

export async function withdrawPreboardingCredential(
  id: string,
): Promise<FormState> {
  if (!isUuid(id)) return failed("forbidden");
  return save("preboarding_withdraw_credential", { p_credential_id: id });
}

/** "Send to HR": tells HR the details are in (they stay editable until the start date). */
export async function finishPreboarding(): Promise<FormState> {
  return save("preboarding_submit", {});
}
