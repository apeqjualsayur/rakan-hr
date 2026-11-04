"use server";

import { refresh } from "next/cache";
import { redirect } from "@/i18n/navigation";
import { getCurrentMember } from "@/lib/auth/member";
import { needsMfa } from "@/lib/auth/roles";
import { failed, saved, settingsContext } from "@/lib/settings/server";
import {
  formLocale,
  isUuid,
  type ErrorKey,
  type FormState,
} from "@/lib/settings/form";
import { createClient } from "@/lib/supabase/server";
import { parseApply, parseHoliday, parseLeaveType, parsePolicy } from "./logic";
import { leaveErrorKey } from "./server";
import type { StatutoryMinimum } from "./types";

// Step 9 server actions. apply_leave / cancel_leave / act_on_approval and the RLS policies
// decide who may do what; these turn the results into messages.

async function memberContext() {
  const member = await getCurrentMember();
  if (!member.tenantId || !member.role || needsMfa(member)) return null;
  return { member, supabase: await createClient() };
}

const dbFailed = (
  error: Parameters<typeof leaveErrorKey>[0],
  context: string,
): FormState => failed(leaveErrorKey(error, context));

/** The medical certificate (or other attachment) the browser uploaded to `leave`. */
function attachmentPath(formData: FormData, tenantId: string) {
  const path = String(formData.get("attachment_path") ?? "");
  return path.startsWith(`${tenantId}/`) && !path.includes("..") ? path : null;
}

/** LVE-05: staff apply (→ manager); HR records for someone else (approved, may override). */
export async function applyLeave(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await memberContext();
  if (!ctx) return failed("forbidden");
  const parsed = parseApply(formData);
  if (!parsed.ok) return { status: "error", errors: parsed.errors };
  const employeeId = formData.get("employee_id");
  const { error } = await ctx.supabase.rpc("apply_leave", {
    p_leave_type_id: parsed.values.leave_type_id,
    p_start: parsed.values.start_date,
    p_end: parsed.values.end_date,
    p_half_day: parsed.values.half_day,
    p_reason: parsed.values.reason,
    p_attachment_path: attachmentPath(formData, ctx.member.tenantId!),
    p_employee_id: isUuid(employeeId) ? employeeId : null,
    p_override_negative: formData.get("override_negative") === "on",
  });
  if (error) {
    const key = leaveErrorKey(error, "applyLeave");
    if (
      key === "insufficientBalance" ||
      key === "overlap" ||
      key === "noWorkingDays" ||
      key === "outsideEmployment"
    )
      return { status: "error", errors: { end_date: key } };
    if (key === "attachmentRequired")
      return { status: "error", errors: { attachment: key } };
    return failed(key);
  }
  if (formData.get("then") === "staff")
    redirect({ href: "/staff/leave?applied=1", locale: formLocale(formData) });
  refresh();
  return saved();
}

/** Days the dates would take (rest days, holidays and half days already counted). */
export async function previewDays(
  leaveTypeId: string,
  start: string,
  end: string,
  halfDay: string | null,
  employeeId: string | null,
): Promise<number | null> {
  const ctx = await memberContext();
  if (
    !ctx ||
    !isUuid(leaveTypeId) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(start) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(end)
  )
    return null;
  const { data } = await ctx.supabase.rpc("preview_leave_days", {
    p_leave_type_id: leaveTypeId,
    p_start: start,
    p_end: end,
    p_half_day: halfDay === "am" || halfDay === "pm" ? halfDay : null,
    p_employee_id: isUuid(employeeId) ? employeeId : null,
  });
  return data === null || data === undefined ? null : Number(data);
}

export async function cancelLeave(id: string): Promise<FormState> {
  const ctx = await memberContext();
  if (!ctx || !isUuid(id)) return failed("forbidden");
  const { error } = await ctx.supabase.rpc("cancel_leave", {
    p_request_id: id,
  });
  if (error) return dbFailed(error, "cancelLeave");
  refresh();
  return saved();
}

/** Manager / HR / owner approve or reject (a comment is needed to reject). */
export async function decideLeave(
  approvalId: string,
  decision: "approved" | "rejected",
  comment: string,
): Promise<FormState> {
  const ctx = await memberContext();
  if (!ctx || !isUuid(approvalId)) return failed("forbidden");
  if (decision === "rejected" && !comment.trim())
    return failed("reasonRequired");
  const { error } = await ctx.supabase.rpc("act_on_approval", {
    p_approval_id: approvalId,
    p_decision: decision,
    p_comment: comment.trim() || null,
  });
  if (error) return dbFailed(error, "decideLeave");
  refresh();
  return saved();
}

/** 5-minute link to a medical certificate (the employee, owner and HR). */
export async function attachmentUrl(
  requestId: string,
): Promise<{ url: string } | { error: ErrorKey }> {
  const ctx = await memberContext();
  if (!ctx || !isUuid(requestId)) return { error: "forbidden" };
  const { data } = await ctx.supabase
    .from("leave_requests")
    .select("attachment_path")
    .eq("id", requestId)
    .maybeSingle();
  if (!data?.attachment_path) return { error: "notFound" };
  const { data: signed } = await ctx.supabase.storage
    .from("leave")
    .createSignedUrl(data.attachment_path as string, 300);
  return signed ? { url: signed.signedUrl } : { error: "forbidden" };
}

export async function adjustBalance(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await settingsContext("editPeople");
  if (!ctx) return failed("forbidden");
  const employeeId = formData.get("employee_id");
  const typeId = formData.get("leave_type_id");
  const raw = String(formData.get("days") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();
  if (!isUuid(employeeId) || !isUuid(typeId)) return failed("forbidden");
  if (!/^-?\d{1,3}(\.[05])?$/.test(raw) || Number(raw) === 0)
    return { status: "error", errors: { days: "invalidNumber" } };
  if (!note) return { status: "error", errors: { note: "required" } };
  const { error } = await ctx.supabase.rpc("adjust_leave_balance", {
    p_employee_id: employeeId,
    p_leave_type_id: typeId,
    p_year: Number(formData.get("year")),
    p_days: Number(raw),
    p_note: note.slice(0, 200),
  });
  if (error) return dbFailed(error, "adjustBalance");
  refresh();
  return saved();
}

// ── Settings > Leave (LVE-01, LVE-02) ──

export async function savePolicy(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await settingsContext("editPeople");
  const typeId = formData.get("leave_type_id");
  if (!ctx || !isUuid(typeId)) return failed("forbidden");
  const [{ data: type }, { data: minimums }] = await Promise.all([
    ctx.supabase
      .from("leave_types")
      .select("code, is_statutory")
      .eq("id", typeId)
      .maybeSingle(),
    ctx.supabase
      .from("statutory_leave_minimums")
      .select("leave_code, min_service_months, max_service_months, days"),
  ]);
  if (!type) return failed("notFound");
  const parsed = parsePolicy(
    formData,
    type.is_statutory ? (type.code as string) : "",
    (minimums ?? []) as StatutoryMinimum[],
  );
  if (!parsed.ok) return { status: "error", errors: parsed.errors };
  const id = formData.get("policy_id");
  const { error } = isUuid(id)
    ? await ctx.supabase
        .from("leave_policies")
        .update(parsed.values)
        .eq("id", id)
    : await ctx.supabase
        .from("leave_policies")
        .insert({ ...parsed.values, leave_type_id: typeId });
  if (error) {
    const key = leaveErrorKey(error, "savePolicy");
    return key === "belowStatutoryMinimum" || key === "bandsOverlap"
      ? { status: "error", errors: { days_per_year: key } }
      : failed(key);
  }
  refresh();
  return saved();
}

export async function deletePolicy(id: string): Promise<FormState> {
  const ctx = await settingsContext("editPeople");
  if (!ctx || !isUuid(id)) return failed("forbidden");
  const { error } = await ctx.supabase
    .from("leave_policies")
    .delete()
    .eq("id", id);
  if (error) return dbFailed(error, "deletePolicy");
  refresh();
  return saved();
}

export async function saveLeaveType(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await settingsContext("editPeople");
  if (!ctx) return failed("forbidden");
  const parsed = parseLeaveType(formData);
  if (!parsed.ok) return { status: "error", errors: parsed.errors };
  const id = formData.get("leave_type_id");
  if (isUuid(id)) {
    const { error } = await ctx.supabase
      .from("leave_types")
      .update({
        name_en: parsed.values.name_en,
        name_ms: parsed.values.name_ms,
        requires_attachment: parsed.values.requires_attachment,
      })
      .eq("id", id);
    if (error) return dbFailed(error, "saveLeaveType");
  } else {
    const code = parsed.values.name_en
      .toUpperCase()
      .normalize("NFKD")
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 30);
    const { error } = await ctx.supabase.from("leave_types").insert({
      ...parsed.values,
      tenant_id: ctx.member.tenantId,
      code: code.length >= 2 ? code : `CUSTOM_${Date.now() % 100000}`,
      sort_order: 80,
    });
    if (error) return dbFailed(error, "saveLeaveType");
  }
  refresh();
  return saved();
}

export async function setLeaveTypeActive(
  id: string,
  active: boolean,
): Promise<FormState> {
  const ctx = await settingsContext("editPeople");
  if (!ctx || !isUuid(id)) return failed("forbidden");
  const { error } = await ctx.supabase
    .from("leave_types")
    .update({ is_active: active })
    .eq("id", id);
  if (error) return dbFailed(error, "setLeaveTypeActive");
  refresh();
  return saved();
}

// ── Settings > Public holidays (LVE-04) ──

export async function addCompanyHoliday(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await settingsContext("editPeople");
  if (!ctx) return failed("forbidden");
  const parsed = parseHoliday(formData);
  if (!parsed.ok) return { status: "error", errors: parsed.errors };
  const { data: tenant } = await ctx.supabase
    .from("tenants")
    .select("state_code")
    .eq("id", ctx.member.tenantId)
    .maybeSingle();
  const { error } = await ctx.supabase.from("public_holidays").insert({
    ...parsed.values,
    tenant_id: ctx.member.tenantId,
    state_code: (tenant?.state_code as string | null) ?? "ALL",
  });
  if (error) return dbFailed(error, "addCompanyHoliday");
  refresh();
  return saved();
}

export async function removeCompanyHoliday(id: string): Promise<FormState> {
  const ctx = await settingsContext("editPeople");
  if (!ctx || !isUuid(id)) return failed("forbidden");
  const { error } = await ctx.supabase
    .from("public_holidays")
    .delete()
    .eq("id", id);
  if (error) return dbFailed(error, "removeCompanyHoliday");
  refresh();
  return saved();
}
