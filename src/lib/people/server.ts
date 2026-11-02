import "server-only";
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { ErrorKey } from "@/lib/settings/form";
import { DIRECTORY_COLUMNS, type DirectoryPerson } from "./directory";

// Server actions for People use the same guard as Settings: the caller, a client acting as
// them, or null when they may not do the action (RLS enforces the same rules).
export {
  settingsContext as peopleContext,
  failed,
  saved,
} from "@/lib/settings/server";

/** Turns a database error into a message the person can act on (Settings.errors). */
export function dbErrorKey(error: PostgrestError, context: string): ErrorKey {
  const text = `${error.message} ${error.hint ?? ""}`;
  if (error.code === "23505") {
    if (text.includes("id_no") || text.includes("employees_tenant_id_no_key"))
      return "duplicateId";
    if (text.includes("pending")) return "pendingExists";
  }
  if (error.code === "23514") {
    if (text.includes("manager_cycle") || text.includes("reporting loop"))
      return "managerLoop";
    if (text.includes("rate_for_pay_model")) return "rateRequired";
    if (text.includes("after_start")) return "beforeStart";
  }
  if (error.code === "22023") {
    if (text.includes("MyKad")) return "invalidMykad";
    if (text.includes("passport")) return "invalidPassport";
    if (text.includes("account number")) return "invalidAccountNo";
    if (text.includes("phone")) return "invalidPhone";
    if (text.includes("email")) return "invalidEmail";
  }
  if (error.code === "42501") {
    return text.includes("not linked") ? "notLinked" : "forbidden";
  }
  console.error(`${context} failed`, error.code, error.message);
  return "saveFailed";
}

const PHOTO_URL_SECONDS = 60 * 60;

/** Short-lived signed links for profile photos (private `avatars` bucket). */
export async function photoUrls(
  supabase: SupabaseClient,
  paths: readonly (string | null)[],
): Promise<Map<string, string>> {
  const wanted = [...new Set(paths.filter((p): p is string => Boolean(p)))];
  if (wanted.length === 0) return new Map();
  const { data } = await supabase.storage
    .from("avatars")
    .createSignedUrls(wanted, PHOTO_URL_SECONDS);
  return new Map(
    (data ?? [])
      .filter((d) => d.path && d.signedUrl && !d.error)
      .map((d): [string, string] => [d.path!, d.signedUrl!]),
  );
}

export type DirectoryEntry = DirectoryPerson & { photoUrl?: string };

/** The whole company directory (EMP-08), with photo links. */
export async function loadDirectory(
  supabase: SupabaseClient,
): Promise<DirectoryEntry[]> {
  const { data } = await supabase
    .from("v_directory")
    .select(DIRECTORY_COLUMNS)
    .order("full_name")
    .returns<DirectoryPerson[]>();
  const people = data ?? [];
  const urls = await photoUrls(
    supabase,
    people.map((p) => p.photo_path),
  );
  return people.map((p) => ({
    ...p,
    photoUrl: p.photo_path ? urls.get(p.photo_path) : undefined,
  }));
}

/**
 * A 5-minute signed link to an employee document (data-model.md §6). RLS decides whether
 * the caller may see the row (owner / HR admin, or the employee themself).
 */
export async function signedDocumentUrl(
  supabase: SupabaseClient,
  documentId: string,
): Promise<{ url: string } | { error: ErrorKey }> {
  const { data } = await supabase
    .from("documents")
    .select("file_path")
    .eq("id", documentId)
    .maybeSingle();
  if (!data) return { error: "notFound" };
  const { data: signed, error } = await supabase.storage
    .from("documents")
    .createSignedUrl(data.file_path as string, 300);
  if (error || !signed) return { error: "notFound" };
  return { url: signed.signedUrl };
}
