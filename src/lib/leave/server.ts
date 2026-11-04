import "server-only";
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { dbErrorKey } from "@/lib/people/server";
import type { ErrorKey } from "@/lib/settings/form";
import {
  BALANCE_COLUMNS,
  LEAVE_TYPE_COLUMNS,
  type Holiday,
  type LeaveBalance,
  type LeaveType,
  type TeamLeave,
} from "./types";

// Leave errors: the database names the reason in the hint.
const HINTS: Record<string, ErrorKey> = {
  below_statutory_minimum: "belowStatutoryMinimum",
  bands_overlap: "bandsOverlap",
  statutory_type: "statutoryType",
  insufficient_balance: "insufficientBalance",
  overlap: "overlap",
  attachment_required: "attachmentRequired",
  not_eligible: "notEligible",
  no_working_days: "noWorkingDays",
  bad_dates: "invalidDate",
  ask_hr: "askHr",
  in_payroll: "inPayroll",
  not_open: "notOpen",
  not_linked: "notLinked",
  reason_required: "reasonRequired",
  outside_employment: "outsideEmployment",
};

export function leaveErrorKey(
  error: PostgrestError,
  context: string,
): ErrorKey {
  return (error.hint && HINTS[error.hint]) || dbErrorKey(error, context);
}

export async function loadLeaveTypes(
  supabase: SupabaseClient,
  activeOnly = true,
) {
  let query = supabase
    .from("leave_types")
    .select(LEAVE_TYPE_COLUMNS)
    .order("sort_order");
  if (activeOnly) query = query.eq("is_active", true);
  const { data } = await query.returns<LeaveType[]>();
  return data ?? [];
}

export async function loadBalances(
  supabase: SupabaseClient,
  year: number,
  employeeId?: string,
) {
  let query = supabase
    .from("leave_balances")
    .select(BALANCE_COLUMNS)
    .eq("year", year);
  if (employeeId) query = query.eq("employee_id", employeeId);
  const { data } = await query.returns<LeaveBalance[]>();
  return data ?? [];
}

export async function loadTeamLeave(
  supabase: SupabaseClient,
  from: string,
  to: string,
) {
  const { data } = await supabase.rpc("team_leave", { p_from: from, p_to: to });
  return (data ?? []) as TeamLeave[];
}

export async function loadHolidays(
  supabase: SupabaseClient,
  from: string,
  to: string,
) {
  const { data } = await supabase.rpc("my_holidays", {
    p_from: from,
    p_to: to,
  });
  return (data ?? []) as Holiday[];
}

/**
 * Pending requests the signed-in user can decide now: their step names them, their role,
 * or they are the owner (who can act on any step). Their own requests are left out.
 */
export async function decidableApprovals(
  supabase: SupabaseClient,
  userId: string,
  role: string,
  approvalIds: readonly string[],
) {
  if (approvalIds.length === 0) return new Set<string>();
  const { data } = await supabase
    .from("approvals")
    .select(
      "id, current_step, requested_by, approval_steps (step_no, approver_role, approver_user_id)",
    )
    .in("id", [...approvalIds])
    .eq("status", "pending");
  const ok = new Set<string>();
  for (const a of (data ?? []) as unknown as {
    id: string;
    current_step: number;
    requested_by: string;
    approval_steps: {
      step_no: number;
      approver_role: string | null;
      approver_user_id: string | null;
    }[];
  }[]) {
    if (a.requested_by === userId) continue;
    const step = a.approval_steps.find((s) => s.step_no === a.current_step);
    if (
      role === "owner" ||
      step?.approver_user_id === userId ||
      (step?.approver_role && step.approver_role === role)
    )
      ok.add(a.id);
  }
  return ok;
}
