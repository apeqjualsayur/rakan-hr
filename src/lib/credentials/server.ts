import "server-only";
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { ErrorKey } from "@/lib/settings/form";
import { dbErrorKey } from "@/lib/people/server";
import {
  CREDENTIAL_COLUMNS,
  FILE_COLUMNS,
  STATUS_COLUMNS,
  TYPE_COLUMNS,
  type CredentialFile,
  type CredentialStatusRow,
  type CredentialType,
  type StaffCredential,
} from "./types";

/** Database errors from the credential functions, as messages people can act on. */
export function credentialErrorKey(
  error: PostgrestError,
  context: string,
): ErrorKey {
  const text = `${error.message} ${error.hint ?? ""}`;
  if (text.includes("no_files")) return "noFiles";
  if (text.includes("expiry_required")) return "required";
  if (text.includes("method_required")) return "methodRequired";
  if (text.includes("reason_required")) return "reasonRequired";
  if (
    text.includes("cannot approve your own") ||
    text.includes("cannot verify your own")
  )
    return "ownCredential";
  if (
    text.includes("not waiting") ||
    text.includes("already submitted") ||
    text.includes("Only a pending")
  )
    return "notPending";
  if (error.code === "23505") return "pendingExists";
  if (error.code === "23514") return "expiryBeforeEffective";
  if (error.code === "P0002") return "notFound";
  return dbErrorKey(error, context);
}

/** The visible status rows (v_credential_status), for one employee or everyone visible. */
export async function loadStatusRows(
  supabase: SupabaseClient,
  employeeId?: string,
) {
  let query = supabase.from("v_credential_status").select(STATUS_COLUMNS);
  if (employeeId) query = query.eq("employee_id", employeeId);
  const { data } = await query.returns<CredentialStatusRow[]>();
  return data ?? [];
}

export async function loadTypes(
  supabase: SupabaseClient,
  { activeOnly = true } = {},
) {
  let query = supabase
    .from("credential_types")
    .select(TYPE_COLUMNS)
    .order("sort_order");
  if (activeOnly) query = query.eq("is_active", true);
  const { data } = await query.returns<CredentialType[]>();
  return data ?? [];
}

export async function loadFiles(
  supabase: SupabaseClient,
  credentialId: string,
) {
  const { data } = await supabase
    .from("credential_files")
    .select(FILE_COLUMNS)
    .eq("staff_credential_id", credentialId)
    .order("page_no")
    .returns<CredentialFile[]>();
  return data ?? [];
}

/** 5-minute signed links (CRD-16). RLS decides whether the caller may see each file. */
export async function signedCredentialUrls(
  supabase: SupabaseClient,
  paths: readonly string[],
) {
  if (paths.length === 0) return new Map<string, string>();
  const { data } = await supabase.storage
    .from("credentials")
    .createSignedUrls([...paths], 300);
  return new Map(
    (data ?? [])
      .filter((d) => d.path && d.signedUrl && !d.error)
      .map((d): [string, string] => [d.path!, d.signedUrl!]),
  );
}

/** One record with its type, signed file links and the other records of that credential. */
export async function loadCredentialDetail(
  supabase: SupabaseClient,
  id: string,
) {
  const { data: credential } = await supabase
    .from("staff_credentials")
    .select(CREDENTIAL_COLUMNS)
    .eq("id", id)
    .maybeSingle<StaffCredential>();
  if (!credential) return null;
  const [{ data: type }, files, { data: history }] = await Promise.all([
    supabase
      .from("credential_types")
      .select(TYPE_COLUMNS)
      .eq("id", credential.credential_type_id)
      .single<CredentialType>(),
    loadFiles(supabase, id),
    supabase
      .from("staff_credentials")
      .select("id, status, effective_date, expiry_date")
      .eq("employee_id", credential.employee_id)
      .eq("credential_type_id", credential.credential_type_id)
      .neq("id", id)
      .neq("status", "draft")
      .order("effective_date", { ascending: false })
      .returns<
        Pick<
          StaffCredential,
          "id" | "status" | "effective_date" | "expiry_date"
        >[]
      >(),
  ]);
  if (!type) return null;
  const urls = await signedCredentialUrls(
    supabase,
    files.map((f) => f.file_path),
  );
  return {
    credential,
    type,
    files: files
      .filter((f) => urls.has(f.file_path))
      .map((f) => ({
        id: f.id,
        url: urls.get(f.file_path)!,
        mime: f.mime,
        page_no: f.page_no,
      })),
    history: history ?? [],
  };
}
