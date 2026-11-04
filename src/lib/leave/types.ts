// Step 9 row shapes (data-model.md §3.5). Day counts arrive as strings (numeric).

export type LeaveType = {
  id: string;
  code: string;
  name_en: string;
  name_ms: string;
  is_paid: boolean;
  is_statutory: boolean;
  requires_attachment: boolean;
  counts_calendar_days: boolean;
  prorate: boolean;
  unlimited: boolean;
  gender: "male" | "female" | null;
  is_active: boolean;
  sort_order: number;
};

export const LEAVE_TYPE_COLUMNS =
  "id, code, name_en, name_ms, is_paid, is_statutory, requires_attachment, counts_calendar_days, prorate, unlimited, gender, is_active, sort_order";

export type LeavePolicy = {
  id: string;
  leave_type_id: string;
  min_service_months: number;
  max_service_months: number | null;
  days_per_year: string;
  carry_forward_max: string;
  carry_forward_expiry_months: number | null;
};

export const POLICY_COLUMNS =
  "id, leave_type_id, min_service_months, max_service_months, days_per_year, carry_forward_max, carry_forward_expiry_months";

export type StatutoryMinimum = {
  leave_code: string;
  min_service_months: number;
  max_service_months: number | null;
  days: string;
};

export type LeaveBalance = {
  id: string;
  employee_id: string;
  leave_type_id: string;
  year: number;
  entitled: string | null;
  carried_forward: string;
  carry_expires_on: string | null;
  carry_forfeited: string;
  adjusted: string;
  adjust_note: string | null;
  taken: string;
  pending: string;
};

export const BALANCE_COLUMNS =
  "id, employee_id, leave_type_id, year, entitled, carried_forward, carry_expires_on, carry_forfeited, adjusted, adjust_note, taken, pending";

export type LeaveStatus = "pending" | "approved" | "rejected" | "cancelled";

export type LeaveRequest = {
  id: string;
  employee_id: string;
  leave_type_id: string;
  start_date: string;
  end_date: string;
  half_day: "am" | "pm" | null;
  days: string;
  reason: string | null;
  attachment_path: string | null;
  status: LeaveStatus;
  approval_id: string | null;
  override_negative: boolean;
  decided_at: string | null;
  decision_comment: string | null;
  created_at: string;
};

export const REQUEST_COLUMNS =
  "id, employee_id, leave_type_id, start_date, end_date, half_day, days, reason, attachment_path, status, approval_id, override_negative, decided_at, decision_comment, created_at";

/** team_leave(): what the caller may see of colleagues' leave (type hidden from staff). */
export type TeamLeave = {
  request_id: string;
  employee_id: string;
  full_name: string;
  branch_id: string | null;
  job_role_id: string | null;
  start_date: string;
  end_date: string;
  half_day: "am" | "pm" | null;
  days: string;
  status: "pending" | "approved";
  leave_type_id: string | null;
  type_code: string | null;
  type_name_en: string | null;
  type_name_ms: string | null;
};

export type Holiday = {
  holiday_date: string;
  name_en: string;
  name_ms: string;
  is_replacement: boolean;
  replaces: string | null;
  is_provisional: boolean;
  is_company: boolean;
};
