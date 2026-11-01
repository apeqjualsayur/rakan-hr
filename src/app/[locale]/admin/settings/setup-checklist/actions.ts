"use server";

import { refresh } from "next/cache";
import { evidenceFolder, isChecklistStatus } from "@/lib/settings/checklist";
import {
  isIsoDate,
  isUuid,
  type ErrorKey,
  type FormState,
} from "@/lib/settings/form";
import { failed, saved, settingsContext } from "@/lib/settings/server";

// ORG-04. Owner and HR admin change items (setup_checklist_items_update policy); the
// database works out rule-based due dates and marks an item done when evidence is added.
// Files are uploaded by the browser straight to the private `company` bucket (Storage
// RLS + bucket limits), then attached here.

type Ctx = NonNullable<Awaited<ReturnType<typeof settingsContext>>>;

async function updateItem(
  itemId: string,
  values: Record<string, unknown>,
): Promise<FormState> {
  const ctx = await settingsContext("editChecklist");
  if (!ctx || !isUuid(itemId)) return failed("forbidden");
  const { data, error } = await ctx.supabase
    .from("setup_checklist_items")
    .update(values)
    .eq("id", itemId)
    .select("id");
  if (error) {
    console.error("checklist update failed", error.code, error.message);
    return failed("saveFailed");
  }
  if (!data?.length) return failed("notFound");
  refresh();
  return saved();
}

export async function setChecklistStatus(itemId: string, status: string) {
  if (!isChecklistStatus(status)) return failed("saveFailed");
  return updateItem(itemId, { status });
}

/** Only items without a rule keep a typed date; the database recomputes the others. */
export async function setChecklistDueDate(itemId: string, date: string) {
  if (date !== "" && !isIsoDate(date)) return failed("invalidDate");
  return updateItem(itemId, { due_date: date === "" ? null : date });
}

async function currentEvidence(ctx: Ctx, itemId: string) {
  const { data } = await ctx.supabase
    .from("setup_checklist_items")
    .select("evidence_file_path")
    .eq("id", itemId)
    .maybeSingle();
  return data ? { path: data.evidence_file_path as string | null } : null;
}

/** Links an uploaded file to the item (which marks it done) and deletes the file it replaces. */
export async function attachEvidence(itemId: string, path: string) {
  const ctx = await settingsContext("editChecklist");
  if (!ctx || !isUuid(itemId)) return failed("forbidden");
  if (
    !path.startsWith(evidenceFolder(ctx.member.tenantId, itemId)) ||
    path.includes("..")
  )
    return failed("forbidden");

  const before = await currentEvidence(ctx, itemId);
  if (!before) return failed("notFound");
  const result = await updateItem(itemId, { evidence_file_path: path });
  if (result.status === "saved" && before.path && before.path !== path) {
    await ctx.supabase.storage.from("company").remove([before.path]);
  }
  return result;
}

export async function removeEvidence(itemId: string) {
  const ctx = await settingsContext("editChecklist");
  if (!ctx || !isUuid(itemId)) return failed("forbidden");
  const before = await currentEvidence(ctx, itemId);
  if (!before) return failed("notFound");
  const result = await updateItem(itemId, { evidence_file_path: null });
  if (result.status === "saved" && before.path) {
    await ctx.supabase.storage.from("company").remove([before.path]);
  }
  return result;
}

/** A 5-minute signed link to the evidence file (data-model.md §6: private, signed URLs). */
export async function evidenceUrl(
  itemId: string,
): Promise<{ url: string } | { error: ErrorKey }> {
  const ctx = await settingsContext("viewChecklist");
  if (!ctx || !isUuid(itemId)) return { error: "forbidden" };
  const before = await currentEvidence(ctx, itemId);
  if (!before?.path) return { error: "notFound" };
  const { data, error } = await ctx.supabase.storage
    .from("company")
    .createSignedUrl(before.path, 300);
  if (error || !data) return { error: "notFound" };
  return { url: data.signedUrl };
}
