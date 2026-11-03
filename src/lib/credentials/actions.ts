"use server";

import { refresh } from "next/cache";
import { getCurrentMember } from "@/lib/auth/member";
import { can, needsMfa } from "@/lib/auth/roles";
import { malaysiaToday } from "@/lib/format";
import { failed, saved } from "@/lib/people/server";
import { isUuid, type ErrorKey, type FormState } from "@/lib/settings/form";
import { createClient } from "@/lib/supabase/server";
import { parseCpd, parseCredential } from "./logic";
import { credentialErrorKey, loadTypes, signedCredentialUrls } from "./server";

// Step 6 server actions, used by staff (own credentials) and HR (anyone's). RLS and the
// database functions decide who may do what; these turn the results into messages.
//
// Adding a credential takes three calls from the browser: saveCredential (creates a draft),
// the upload-credential-file Edge Function for each file, then submitCredential.

/** saved + the record id, so the browser can upload files to it. */
export type DraftState =
  FormState | { status: "draft"; id: string; at: number };

async function context() {
  const member = await getCurrentMember();
  if (!member.tenantId || !member.role || needsMfa(member)) return null;
  return { member, supabase: await createClient() };
}

/**
 * Creates a draft (new or renewal), or updates one still in draft / pending.
 * employee_id: the staff member themself, or anyone when HR adds on their behalf (CRD-10).
 */
export async function saveCredential(
  _state: DraftState,
  formData: FormData,
): Promise<DraftState> {
  const ctx = await context();
  if (!ctx) return failed("forbidden");
  const types = await loadTypes(ctx.supabase);
  const parsed = parseCredential(formData, types);
  if (!parsed.ok) return { status: "error", errors: parsed.errors };

  const id = formData.get("credential_id");
  if (isUuid(id)) {
    // The type of an existing record never changes.
    const values: Partial<typeof parsed.values> = { ...parsed.values };
    delete values.credential_type_id;
    const { data, error } = await ctx.supabase
      .from("staff_credentials")
      .update(values)
      .eq("id", id)
      .select("id");
    if (error) return failed(credentialErrorKey(error, "saveCredential"));
    if (!data?.length) return failed("notFound");
    return { status: "draft", id, at: Date.now() };
  }

  const employeeId = formData.get("employee_id");
  const forSelf = !isUuid(employeeId) || employeeId === ctx.member.employeeId;
  if (forSelf && !ctx.member.employeeId) return failed("notLinked");
  if (!forSelf && !can(ctx.member.role, "editPeople"))
    return failed("forbidden");
  const previous = formData.get("previous_id");
  const { data, error } = await ctx.supabase
    .from("staff_credentials")
    .insert({
      ...parsed.values,
      employee_id: forSelf ? ctx.member.employeeId : employeeId,
      ...(isUuid(previous) ? { previous_id: previous } : {}),
    })
    .select("id")
    .single();
  if (error || !data)
    return failed(
      error ? credentialErrorKey(error, "saveCredential") : "saveFailed",
    );
  return { status: "draft", id: data.id as string, at: Date.now() };
}

async function rpc(
  name: string,
  args: Record<string, unknown>,
  context_: string,
): Promise<FormState> {
  const ctx = await context();
  if (!ctx) return failed("forbidden");
  const { error } = await ctx.supabase.rpc(name, args);
  if (error) return failed(credentialErrorKey(error, context_));
  refresh();
  return saved();
}

export async function submitCredential(id: string) {
  if (!isUuid(id)) return failed("forbidden");
  return rpc("submit_credential", { p_credential_id: id }, "submitCredential");
}

export async function withdrawCredential(id: string) {
  if (!isUuid(id)) return failed("forbidden");
  return rpc(
    "withdraw_credential",
    { p_credential_id: id },
    "withdrawCredential",
  );
}

/** A draft whose files never uploaded can be thrown away. */
export async function discardDraft(id: string): Promise<FormState> {
  const ctx = await context();
  if (!ctx || !isUuid(id)) return failed("forbidden");
  await ctx.supabase
    .from("staff_credentials")
    .delete()
    .eq("id", id)
    .eq("status", "draft");
  return saved();
}

/** CRD-09: verify (with the method used) or reject (with the reason). Owner / HR admin. */
export async function decideCredential(
  id: string,
  decision: "verified" | "rejected",
  note: string,
): Promise<FormState> {
  if (!isUuid(id) || (decision !== "verified" && decision !== "rejected"))
    return failed("forbidden");
  if (note.trim() === "")
    return {
      status: "error",
      errors: {
        note: decision === "verified" ? "methodRequired" : "reasonRequired",
      },
    };
  return rpc(
    "decide_credential",
    { p_credential_id: id, p_decision: decision, p_note: note.trim() },
    "decideCredential",
  );
}

/** Signed links for a credential's files (5 minutes). */
export async function credentialFileUrls(
  credentialId: string,
): Promise<
  | { files: { id: string; url: string; mime: string; page_no: number }[] }
  | { error: ErrorKey }
> {
  const ctx = await context();
  if (!ctx || !isUuid(credentialId)) return { error: "forbidden" };
  const { data } = await ctx.supabase
    .from("credential_files")
    .select("id, file_path, mime, page_no")
    .eq("staff_credential_id", credentialId)
    .order("page_no");
  const urls = await signedCredentialUrls(
    ctx.supabase,
    (data ?? []).map((f) => f.file_path as string),
  );
  return {
    files: (data ?? [])
      .filter((f) => urls.has(f.file_path as string))
      .map((f) => ({
        id: f.id as string,
        url: urls.get(f.file_path as string)!,
        mime: f.mime as string,
        page_no: f.page_no as number,
      })),
  };
}

// ── CPD (CRD-18) ──

export async function saveCpd(
  _state: DraftState,
  formData: FormData,
): Promise<DraftState> {
  const ctx = await context();
  if (!ctx) return failed("forbidden");
  const types = (await loadTypes(ctx.supabase)).filter((t) => t.tracks_cpd);
  const parsed = parseCpd(
    formData,
    types.map((t) => t.id),
    malaysiaToday(),
  );
  if (!parsed.ok) return { status: "error", errors: parsed.errors };

  const id = formData.get("activity_id");
  if (isUuid(id)) {
    const { data, error } = await ctx.supabase
      .from("cpd_activities")
      .update(parsed.values)
      .eq("id", id)
      .select("id");
    if (error) return failed(credentialErrorKey(error, "saveCpd"));
    if (!data?.length) return failed("notFound");
    return { status: "draft", id, at: Date.now() };
  }
  const employeeId = formData.get("employee_id");
  const forSelf = !isUuid(employeeId) || employeeId === ctx.member.employeeId;
  if (forSelf && !ctx.member.employeeId) return failed("notLinked");
  if (!forSelf && !can(ctx.member.role, "editPeople"))
    return failed("forbidden");
  const { data, error } = await ctx.supabase
    .from("cpd_activities")
    .insert({
      ...parsed.values,
      employee_id: forSelf ? ctx.member.employeeId : employeeId,
    })
    .select("id")
    .single();
  if (error || !data)
    return failed(error ? credentialErrorKey(error, "saveCpd") : "saveFailed");
  return { status: "draft", id: data.id as string, at: Date.now() };
}

/** After the certificate upload (or without one): show the new activity. */
export async function cpdSaved(): Promise<FormState> {
  refresh();
  return saved();
}

export async function withdrawCpd(id: string) {
  if (!isUuid(id)) return failed("forbidden");
  return rpc("withdraw_cpd", { p_activity_id: id }, "withdrawCpd");
}

export async function decideCpd(
  id: string,
  decision: "verified" | "rejected",
  reason: string,
) {
  if (!isUuid(id) || (decision !== "verified" && decision !== "rejected"))
    return failed("forbidden");
  if (decision === "rejected" && reason.trim() === "")
    return { status: "error", errors: { note: "reasonRequired" } } as FormState;
  return rpc(
    "decide_cpd",
    {
      p_activity_id: id,
      p_decision: decision,
      p_reason: reason.trim() || null,
    },
    "decideCpd",
  );
}

export async function cpdFileUrl(
  id: string,
): Promise<{ url: string } | { error: ErrorKey }> {
  const ctx = await context();
  if (!ctx || !isUuid(id)) return { error: "forbidden" };
  const { data } = await ctx.supabase
    .from("cpd_activities")
    .select("file_path")
    .eq("id", id)
    .maybeSingle();
  if (!data?.file_path) return { error: "notFound" };
  const urls = await signedCredentialUrls(ctx.supabase, [
    data.file_path as string,
  ]);
  const url = urls.get(data.file_path as string);
  return url ? { url } : { error: "notFound" };
}
