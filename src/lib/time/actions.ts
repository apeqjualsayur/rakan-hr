"use server";

import { refresh } from "next/cache";
import { getCurrentMember } from "@/lib/auth/member";
import { needsMfa } from "@/lib/auth/roles";
import { leaveErrorKey } from "@/lib/leave/server";
import { failed, saved, settingsContext } from "@/lib/settings/server";
import { isUuid, type ErrorKey, type FormState } from "@/lib/settings/form";
import { createClient } from "@/lib/supabase/server";
import { parseOt, parseShift } from "./logic";
import type { OtCalculation, ShiftIssue } from "./types";

// Step 10 server actions. clock_in / clock_out / request_ot / publish_roster and the RLS
// policies decide who may do what; these turn the results into messages.

async function memberContext() {
  const member = await getCurrentMember();
  if (!member.tenantId || !member.role || needsMfa(member)) return null;
  return { member, supabase: await createClient() };
}

const HINTS: Record<string, ErrorKey> = {
  reason_required: "reasonRequired",
  already_clocked_in: "alreadyClockedIn",
  not_clocked_in: "notClockedIn",
  shift_overlap: "shiftOverlap",
  credential_block: "credentialBlock",
  ot_exists: "otExists",
  bad_hours: "invalidHours",
};

const errorKey = (
  error: Parameters<typeof leaveErrorKey>[0],
  context: string,
): ErrorKey =>
  (error.hint && HINTS[error.hint]) || leaveErrorKey(error, context);

// ── ATT-01 clock in / out ──

export type ClockResult = { ok: true } | { ok: false; error: ErrorKey };

export async function geofenceStatus(
  branchId: string,
  lat: number | null,
  lng: number | null,
): Promise<{ inside: boolean | null; distance: number | null } | null> {
  const ctx = await memberContext();
  if (!ctx || !isUuid(branchId)) return null;
  const { data } = await ctx.supabase
    .rpc("geofence_check", { p_branch_id: branchId, p_lat: lat, p_lng: lng })
    .maybeSingle();
  const row = data as {
    inside: boolean | null;
    distance_m: string | null;
  } | null;
  return row
    ? {
        inside: row.inside,
        distance: row.distance_m === null ? null : Number(row.distance_m),
      }
    : null;
}

export async function clockIn(
  lat: number | null,
  lng: number | null,
  accuracy: number | null,
  reason: string | null,
  selfiePath: string | null,
): Promise<ClockResult> {
  const ctx = await memberContext();
  if (!ctx) return { ok: false, error: "forbidden" };
  const { error } = await ctx.supabase.rpc("clock_in", {
    p_lat: lat,
    p_lng: lng,
    p_accuracy: accuracy,
    p_reason: reason,
    p_selfie_path:
      selfiePath && selfiePath.startsWith(`${ctx.member.tenantId}/`)
        ? selfiePath
        : null,
  });
  if (error) return { ok: false, error: errorKey(error, "clockIn") };
  refresh();
  return { ok: true };
}

export async function clockOut(
  lat: number | null,
  lng: number | null,
  accuracy: number | null,
  reason: string | null,
): Promise<ClockResult> {
  const ctx = await memberContext();
  if (!ctx) return { ok: false, error: "forbidden" };
  const { error } = await ctx.supabase.rpc("clock_out", {
    p_lat: lat,
    p_lng: lng,
    p_accuracy: accuracy,
    p_reason: reason,
  });
  if (error) return { ok: false, error: errorKey(error, "clockOut") };
  refresh();
  return { ok: true };
}

/** HR records or corrects attendance (Malaysia local times), with a reason. */
export async function recordAttendance(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await settingsContext("editPeople");
  if (!ctx) return failed("forbidden");
  const employee = formData.get("employee_id");
  const date = String(formData.get("work_date") ?? "");
  const inTime = String(formData.get("clock_in") ?? "");
  const outTime = String(formData.get("clock_out") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  const errors: Record<string, ErrorKey> = {};
  if (!isUuid(employee)) errors.employee_id = "required";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) errors.work_date = "required";
  if (!/^\d{2}:\d{2}$/.test(inTime)) errors.clock_in = "required";
  if (outTime && (!/^\d{2}:\d{2}$/.test(outTime) || outTime <= inTime))
    errors.clock_out = "endBeforeStart";
  if (!reason) errors.reason = "required";
  if (Object.keys(errors).length) return { status: "error", errors };
  const logId = formData.get("log_id");
  const { error } = await ctx.supabase.rpc("record_attendance", {
    p_employee_id: employee,
    p_clock_in_at: `${date}T${inTime}:00+08:00`,
    p_clock_out_at: outTime ? `${date}T${outTime}:00+08:00` : null,
    p_reason: reason.slice(0, 300),
    p_log_id: isUuid(logId) ? logId : null,
  });
  if (error) return failed(errorKey(error, "recordAttendance"));
  refresh();
  return saved();
}

/** 5-minute link to a clock-in selfie (owner / HR). */
export async function selfieUrl(
  logId: string,
): Promise<{ url: string } | { error: ErrorKey }> {
  const ctx = await settingsContext("viewSensitive");
  if (!ctx || !isUuid(logId)) return { error: "forbidden" };
  const { data } = await ctx.supabase
    .from("attendance_logs")
    .select("selfie_path")
    .eq("id", logId)
    .maybeSingle();
  if (!data?.selfie_path) return { error: "notFound" };
  const { data: signed } = await ctx.supabase.storage
    .from("selfies")
    .createSignedUrl(data.selfie_path as string, 300);
  return signed ? { url: signed.signedUrl } : { error: "notFound" };
}

// ── ATT-02 / ATT-03 roster ──

export async function saveShift(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await memberContext();
  if (!ctx) return failed("forbidden");
  const parsed = parseShift(formData);
  if (!parsed.ok) return { status: "error", errors: parsed.errors };
  const id = formData.get("shift_id");
  const branch = formData.get("branch_id");
  if (!isUuid(branch)) return failed("forbidden");
  const values = { ...parsed.values, branch_id: branch };
  const { error } = isUuid(id)
    ? await ctx.supabase.from("roster_shifts").update(values).eq("id", id)
    : await ctx.supabase.from("roster_shifts").insert(values);
  if (error) {
    const key = errorKey(error, "saveShift");
    return key === "shiftOverlap" || key === "credentialBlock"
      ? { status: "error", errors: { employee_id: key } }
      : failed(key);
  }
  refresh();
  return saved();
}

export async function deleteShift(id: string): Promise<FormState> {
  const ctx = await memberContext();
  if (!ctx || !isUuid(id)) return failed("forbidden");
  const { error } = await ctx.supabase
    .from("roster_shifts")
    .delete()
    .eq("id", id);
  if (error) return failed(errorKey(error, "deleteShift"));
  refresh();
  return saved();
}

/** Checks for a shift before saving it (leave, 45 h week, credentials, rest day / holiday). */
export async function checkShift(
  employeeId: string,
  date: string,
  start: string,
  end: string,
  breakMinutes: number,
  shiftId: string | null,
): Promise<ShiftIssue[]> {
  const ctx = await memberContext();
  if (
    !ctx ||
    !isUuid(employeeId) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !(end > start)
  )
    return [];
  const { data } = await ctx.supabase.rpc("check_shift", {
    p_employee_id: employeeId,
    p_date: date,
    p_start: start,
    p_end: end,
    p_break: breakMinutes,
    p_shift_id: isUuid(shiftId) ? shiftId : null,
  });
  return (data ?? []) as ShiftIssue[];
}

export async function copyLastWeek(
  branchId: string,
  monday: string,
): Promise<FormState & { count?: number }> {
  const ctx = await memberContext();
  if (!ctx || !isUuid(branchId)) return failed("forbidden");
  const { data, error } = await ctx.supabase.rpc("copy_roster_week", {
    p_branch_id: branchId,
    p_week_start: monday,
  });
  if (error) return failed(errorKey(error, "copyLastWeek"));
  refresh();
  return { ...saved(), count: Number(data ?? 0) };
}

export async function publishWeek(
  branchId: string,
  monday: string,
): Promise<FormState & { count?: number }> {
  const ctx = await memberContext();
  if (!ctx || !isUuid(branchId)) return failed("forbidden");
  const { data, error } = await ctx.supabase.rpc("publish_roster", {
    p_branch_id: branchId,
    p_week_start: monday,
  });
  if (error) return failed(errorKey(error, "publishWeek"));
  refresh();
  return { ...saved(), count: Number(data ?? 0) };
}

// ── ATT-04 overtime ──

export async function requestOt(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await memberContext();
  if (!ctx) return failed("forbidden");
  const parsed = parseOt(formData);
  if (!parsed.ok) return { status: "error", errors: parsed.errors };
  const employee = formData.get("employee_id");
  const { error } = await ctx.supabase.rpc("request_ot", {
    p_work_date: parsed.values.work_date,
    p_hours: parsed.values.hours,
    p_reason: parsed.values.reason,
    p_employee_id: isUuid(employee) ? employee : null,
  });
  if (error) {
    const key = errorKey(error, "requestOt");
    return key === "otExists" || key === "outsideEmployment"
      ? { status: "error", errors: { work_date: key } }
      : failed(key);
  }
  refresh();
  return saved();
}

export async function previewOt(
  date: string,
  hours: number,
  employeeId: string | null,
): Promise<OtCalculation | null> {
  const ctx = await memberContext();
  if (!ctx || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !(hours > 0 && hours <= 24))
    return null;
  const { data } = await ctx.supabase.rpc("preview_ot", {
    p_work_date: date,
    p_hours: hours,
    p_employee_id: isUuid(employeeId) ? employeeId : null,
  });
  return (data as OtCalculation | null) ?? null;
}

export async function cancelOt(id: string): Promise<FormState> {
  const ctx = await memberContext();
  if (!ctx || !isUuid(id)) return failed("forbidden");
  const { error } = await ctx.supabase.rpc("cancel_ot", { p_request_id: id });
  if (error) return failed(errorKey(error, "cancelOt"));
  refresh();
  return saved();
}
