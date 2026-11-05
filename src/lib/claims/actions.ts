"use server";

import { refresh } from "next/cache";
import { getCurrentMember } from "@/lib/auth/member";
import { needsMfa } from "@/lib/auth/roles";
import { leaveErrorKey } from "@/lib/leave/server";
import { malaysiaToday } from "@/lib/format";
import { failed, saved, settingsContext } from "@/lib/settings/server";
import { isUuid, type ErrorKey, type FormState } from "@/lib/settings/form";
import { createClient } from "@/lib/supabase/server";
import { parseClaim, parseClaimType } from "./logic";

// Step 11 server actions. submit_claim / cancel_claim / act_on_approval and RLS decide;
// these turn the results into messages.

async function memberContext() {
  const member = await getCurrentMember();
  if (!member.tenantId || !member.role || needsMfa(member)) return null;
  return { member, supabase: await createClient() };
}

const HINTS: Record<string, ErrorKey> = {
  per_claim_limit: "perClaimLimit",
  monthly_limit: "monthlyLimit",
  receipt_required: "receiptRequired",
  no_mileage_rate: "noMileageRate",
  distance_required: "required",
  amount_required: "required",
  description_required: "required",
  future_date: "futureDate",
  already_sent: "alreadySent",
};

const errorKey = (
  error: Parameters<typeof leaveErrorKey>[0],
  context: string,
): ErrorKey =>
  (error.hint && HINTS[error.hint]) || leaveErrorKey(error, context);

export type ClaimResult =
  | { status: "idle" }
  | { status: "saved"; at: number }
  | {
      status: "error";
      errors?: Partial<Record<string, ErrorKey>>;
      message?: ErrorKey;
      limit?: string;
    };

/**
 * CLM-01 send a claim. The browser has already put the receipts in
 * receipts/{tenant}/{employee}/{claim id}/; the database attaches them and checks limits.
 * Limit refusals carry the amount (left this month, or the per-claim limit).
 */
export async function submitClaim(formData: FormData): Promise<ClaimResult> {
  const ctx = await memberContext();
  if (!ctx) return { status: "error", message: "forbidden" };
  const claimId = formData.get("claim_id");
  if (!isUuid(claimId)) return { status: "error", message: "forbidden" };
  const parsed = parseClaim(
    formData,
    formData.get("is_mileage") === "true",
    malaysiaToday(),
  );
  if (!parsed.ok) return { status: "error", errors: parsed.errors };
  const v = parsed.values;
  const employee = formData.get("employee_id");
  const { error } = await ctx.supabase.rpc("submit_claim", {
    p_claim_id: claimId,
    p_claim_type_id: v.claim_type_id,
    p_expense_date: v.expense_date,
    p_amount: v.amount,
    p_description: v.description,
    p_distance_km: v.distance_km,
    p_trip_from: v.trip_from,
    p_trip_to: v.trip_to,
    p_employee_id: isUuid(employee) ? employee : null,
  });
  if (error) {
    const key = errorKey(error, "submitClaim");
    if (key === "monthlyLimit" || key === "perClaimLimit")
      return {
        status: "error",
        message: key,
        limit: error.details ?? undefined,
      };
    if (key === "receiptRequired")
      return { status: "error", errors: { receipt: key } };
    return { status: "error", message: key };
  }
  refresh();
  return { status: "saved", at: Date.now() };
}

export async function cancelClaim(id: string): Promise<FormState> {
  const ctx = await memberContext();
  if (!ctx || !isUuid(id)) return failed("forbidden");
  const { error } = await ctx.supabase.rpc("cancel_claim", { p_claim_id: id });
  if (error) return failed(errorKey(error, "cancelClaim"));
  refresh();
  return saved();
}

/** 5-minute links to a claim's receipts (the claimant, their approver, HR). */
export async function receiptUrls(claimId: string): Promise<string[]> {
  const ctx = await memberContext();
  if (!ctx || !isUuid(claimId)) return [];
  const { data } = await ctx.supabase
    .from("claim_receipts")
    .select("file_path")
    .eq("claim_id", claimId);
  const paths = (data ?? []).map((r) => r.file_path as string);
  if (paths.length === 0) return [];
  const { data: signed } = await ctx.supabase.storage
    .from("receipts")
    .createSignedUrls(paths, 300);
  return (signed ?? []).filter((s) => s.signedUrl).map((s) => s.signedUrl!);
}

// ── Settings > Claims ──

export async function saveClaimType(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await settingsContext("editPeople");
  if (!ctx) return failed("forbidden");
  const parsed = parseClaimType(formData);
  if (!parsed.ok) return { status: "error", errors: parsed.errors };
  const id = formData.get("claim_type_id");
  const { error } = isUuid(id)
    ? await ctx.supabase.from("claim_types").update(parsed.values).eq("id", id)
    : await ctx.supabase
        .from("claim_types")
        .insert({
          ...parsed.values,
          tenant_id: ctx.member.tenantId,
          sort_order: 100,
        });
  if (error) {
    if (error.code === "23505")
      return { status: "error", errors: { name_en: "duplicateName" } };
    return failed(errorKey(error, "saveClaimType"));
  }
  refresh();
  return saved();
}

export async function setClaimTypeActive(
  id: string,
  active: boolean,
): Promise<FormState> {
  const ctx = await settingsContext("editPeople");
  if (!ctx || !isUuid(id)) return failed("forbidden");
  const { error } = await ctx.supabase
    .from("claim_types")
    .update({ is_active: active })
    .eq("id", id);
  if (error) return failed(errorKey(error, "setClaimTypeActive"));
  refresh();
  return saved();
}

/** Rate per km for mileage claims (owner only: it changes the company profile). */
export async function saveMileageRate(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await settingsContext("editCompany");
  if (!ctx) return failed("forbidden");
  const raw = String(formData.get("mileage_rate_per_km") ?? "").trim();
  if (raw !== "" && (!/^\d{1,2}(\.\d{1,2})?$/.test(raw) || Number(raw) <= 0))
    return { status: "error", errors: { mileage_rate_per_km: "invalidMoney" } };
  const { error } = await ctx.supabase
    .from("tenants")
    .update({ mileage_rate_per_km: raw === "" ? null : raw })
    .eq("id", ctx.member.tenantId);
  if (error) return failed(errorKey(error, "saveMileageRate"));
  refresh();
  return saved();
}
