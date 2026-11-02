"use server";

import { refresh } from "next/cache";
import { getCurrentMember } from "@/lib/auth/member";
import { needsMfa } from "@/lib/auth/roles";
import { parseChangeRequest } from "@/lib/people/changes";
import {
  dbErrorKey,
  failed,
  saved,
  signedDocumentUrl,
} from "@/lib/people/server";
import { isUuid, type ErrorKey, type FormState } from "@/lib/settings/form";
import { createClient } from "@/lib/supabase/server";

// EMP-07 staff self-service. Staff never write their record: they ask, and
// request_profile_change() creates an HR approval (bank changes always need one).

async function selfContext() {
  const member = await getCurrentMember();
  if (!member.tenantId || !member.role || needsMfa(member)) return null;
  return { member, supabase: await createClient() };
}

export async function requestChange(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await selfContext();
  if (!ctx) return failed("forbidden");
  if (!ctx.member.employeeId) return failed("notLinked");

  const { data: banks } = await ctx.supabase
    .from("banks")
    .select("code")
    .eq("is_active", true);
  const parsed = parseChangeRequest(
    formData,
    (banks ?? []).map((b) => b.code as string),
  );
  if (!parsed.ok) return { status: "error", errors: parsed.errors };

  const { error } = await ctx.supabase.rpc("request_profile_change", {
    p_field: parsed.values.field,
    p_value: parsed.values.value,
    p_note: parsed.values.note,
  });
  if (error) {
    const key = dbErrorKey(error, "requestChange");
    if (key === "invalidAccountNo")
      return { status: "error", errors: { account_no: key } };
    if (key === "invalidPhone" || key === "invalidEmail")
      return { status: "error", errors: { value: key } };
    return failed(key);
  }
  refresh();
  return saved();
}

export async function withdrawChange(requestId: string): Promise<FormState> {
  const ctx = await selfContext();
  if (!ctx || !isUuid(requestId)) return failed("forbidden");
  const { error } = await ctx.supabase.rpc("cancel_profile_change", {
    p_request_id: requestId,
  });
  if (error) return failed(dbErrorKey(error, "withdrawChange"));
  refresh();
  return saved();
}

/** Staff open their own documents (RLS: documents_select, storage documents_files_select). */
export async function myDocumentUrl(
  documentId: string,
): Promise<{ url: string } | { error: ErrorKey }> {
  const ctx = await selfContext();
  if (!ctx || !isUuid(documentId)) return { error: "forbidden" };
  return signedDocumentUrl(ctx.supabase, documentId);
}
