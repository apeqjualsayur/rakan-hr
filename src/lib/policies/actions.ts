"use server";

import { refresh } from "next/cache";
import { getCurrentMember } from "@/lib/auth/member";
import { can, needsMfa } from "@/lib/auth/roles";
import { sha256Hex } from "@/lib/pdf";
import { failed, saved } from "@/lib/people/server";
import { isUuid, type ErrorKey, type FormState } from "@/lib/settings/form";
import { createClient } from "@/lib/supabase/server";
import { parseAnnouncement, parsePolicy } from "./logic";
import { signPolicyDocument, type SignResult } from "./sign";

// Step 7 server actions. RLS and the database functions enforce who may do what.

async function context() {
  const member = await getCurrentMember();
  if (!member.tenantId || !member.role || needsMfa(member)) return null;
  return { member, supabase: await createClient() };
}

/** POL-03: sign the current version of a policy (also the PDPA notice). */
export async function signPolicy(
  policyId: string,
  typedName: string,
  consented: boolean,
  locale: string,
): Promise<SignResult> {
  const ctx = await context();
  if (!ctx || !isUuid(policyId)) return { ok: false, error: "forbidden" };
  if (!consented) return { ok: false, error: "required" };
  // The consent wording is stored in the language the signer saw it in.
  const result = await signPolicyDocument(
    ctx.supabase,
    ctx.member,
    policyId,
    typedName,
    locale === "ms" ? "ms" : "en",
  );
  if (result.ok) refresh();
  return result;
}

/**
 * POL-02: publish a policy, or a new version of one. The browser has already uploaded the
 * PDF to the private `policies` bucket; here its bytes are checked and fingerprinted.
 */
export async function publishPolicy(
  _state: FormState,
  formData: FormData,
): Promise<FormState & { id?: string }> {
  const ctx = await context();
  if (!ctx || !can(ctx.member.role, "editPeople")) return failed("forbidden");
  const parsed = parsePolicy(formData);
  if (!parsed.ok) return { status: "error", errors: parsed.errors };
  const path = String(formData.get("file_path") ?? "");
  if (
    !path.startsWith(`${ctx.member.tenantId}/${parsed.values.code}/`) ||
    path.includes("..")
  )
    return { status: "error", errors: { file: "required" } };

  const { data: blob, error: downloadError } = await ctx.supabase.storage
    .from("policies")
    .download(path);
  if (downloadError || !blob)
    return { status: "error", errors: { file: "required" } };
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-")
    return { status: "error", errors: { file: "notPdf" } };

  const { data, error } = await ctx.supabase
    .from("policy_documents")
    .insert({
      ...parsed.values,
      tenant_id: ctx.member.tenantId,
      version: 1, // numbered by the database
      file_path: path,
      document_sha256: sha256Hex(bytes),
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("publishPolicy failed", error?.code, error?.message);
    return failed("saveFailed");
  }
  refresh();
  return { ...saved(), id: data.id as string };
}

/** 5-minute link to a policy PDF (any member of the company may read policies). */
export async function policyFileUrl(
  policyId: string,
): Promise<{ url: string } | { error: ErrorKey }> {
  const ctx = await context();
  if (!ctx || !isUuid(policyId)) return { error: "forbidden" };
  const { data } = await ctx.supabase
    .from("policy_documents")
    .select("file_path")
    .eq("id", policyId)
    .maybeSingle();
  if (!data) return { error: "notFound" };
  const { data: signed } = await ctx.supabase.storage
    .from("policies")
    .createSignedUrl(data.file_path as string, 300);
  return signed ? { url: signed.signedUrl } : { error: "notFound" };
}

/** 5-minute link to a signed copy (the signer, or owner / HR / auditor). */
export async function signedCopyUrl(
  signatureId: string,
): Promise<{ url: string } | { error: ErrorKey }> {
  const ctx = await context();
  if (!ctx || !isUuid(signatureId)) return { error: "forbidden" };
  const { data } = await ctx.supabase
    .from("signatures")
    .select("signed_pdf_path")
    .eq("id", signatureId)
    .maybeSingle();
  if (!data) return { error: "notFound" };
  const { data: signed } = await ctx.supabase.storage
    .from("signed")
    .createSignedUrl(data.signed_pdf_path as string, 300);
  return signed ? { url: signed.signedUrl } : { error: "notFound" };
}

// ── Announcements (POL-01) ──

export async function saveAnnouncement(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await context();
  if (!ctx || !can(ctx.member.role, "editPeople")) return failed("forbidden");
  const parsed = parseAnnouncement(formData, new Date().toISOString());
  if (!parsed.ok) return { status: "error", errors: parsed.errors };
  const { error } = await ctx.supabase
    .from("announcements")
    .insert({ ...parsed.values, tenant_id: ctx.member.tenantId });
  if (error) {
    console.error("saveAnnouncement failed", error.code, error.message);
    return failed("saveFailed");
  }
  refresh();
  return saved();
}

export async function setPinned(
  id: string,
  pinned: boolean,
): Promise<FormState> {
  const ctx = await context();
  if (!ctx || !isUuid(id) || !can(ctx.member.role, "editPeople"))
    return failed("forbidden");
  const { error } = await ctx.supabase
    .from("announcements")
    .update({ pinned })
    .eq("id", id);
  if (error) return failed("saveFailed");
  refresh();
  return saved();
}

export async function deleteAnnouncement(id: string): Promise<FormState> {
  const ctx = await context();
  if (!ctx || !isUuid(id) || !can(ctx.member.role, "editPeople"))
    return failed("forbidden");
  const { error } = await ctx.supabase
    .from("announcements")
    .delete()
    .eq("id", id);
  if (error) return failed("saveFailed");
  refresh();
  return saved();
}

/** Read receipts for what the viewer has on screen. */
export async function markAnnouncementsRead(ids: string[]): Promise<void> {
  const ctx = await context();
  const valid = ids.filter(isUuid);
  if (!ctx || valid.length === 0) return;
  await ctx.supabase.rpc("mark_announcements_read", { p_ids: valid });
}
