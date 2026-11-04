// Step 10 row shapes (data-model.md §3.6). Times from Postgres `time` come as "08:30:00".

export type RosterShift = {
  id: string;
  branch_id: string;
  employee_id: string;
  shift_date: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
  room_or_service: string | null;
  is_on_call: boolean;
  notes: string | null;
  published_at: string | null;
};

export const SHIFT_COLUMNS =
  "id, branch_id, employee_id, shift_date, start_time, end_time, break_minutes, room_or_service, is_on_call, notes, published_at";

export type ShiftIssue = {
  code: "LEAVE" | "WEEK_HOURS" | "CREDENTIAL" | "REST_DAY" | "HOLIDAY";
  severity: "warning" | "block";
  detail: Record<string, unknown>;
};

export type AttendanceLog = {
  id: string;
  employee_id: string;
  branch_id: string | null;
  shift_id: string | null;
  work_date: string;
  clock_in_at: string;
  clock_out_at: string | null;
  within_geofence: boolean | null;
  out_within_geofence: boolean | null;
  outside_reason: string | null;
  out_outside_reason: string | null;
  selfie_path: string | null;
  source: "pwa" | "manual";
  manual_reason: string | null;
};

export const ATTENDANCE_COLUMNS =
  "id, employee_id, branch_id, shift_id, work_date, clock_in_at, clock_out_at, within_geofence, out_within_geofence, outside_reason, out_outside_reason, selfie_path, source, manual_reason";

export type DayType = "normal" | "rest_day" | "public_holiday";

export type OtLine = {
  rule:
    | "normal_ot"
    | "rest_day_half"
    | "rest_day_full"
    | "rest_day_ot"
    | "holiday_normal"
    | "holiday_ot";
  hours: number;
  multiplier: number;
  basis: "orp" | "hrp";
  amount: number;
};

export type OtCalculation = {
  covered: boolean;
  method: "ea" | "contract" | "none" | "manual";
  reason?: string;
  monthly_wage?: number;
  threshold?: number;
  orp?: number;
  hrp?: number;
  normal_hours?: number;
  lines?: OtLine[];
  amount: number | null;
  day_type?: DayType;
  month_hours?: number;
  month_limit?: number;
};

export type OtRequest = {
  id: string;
  employee_id: string;
  work_date: string;
  day_type: DayType;
  hours: string;
  reason: string | null;
  status: "pending" | "approved" | "rejected" | "cancelled";
  approval_id: string | null;
  calculated_amount: string | null;
  calculation: OtCalculation | null;
  decision_comment: string | null;
  created_at: string;
};

export const OT_COLUMNS =
  "id, employee_id, work_date, day_type, hours, reason, status, approval_id, calculated_amount, calculation, decision_comment, created_at";

/** my_today(): the signed-in employee's day. */
export type Today = {
  shift: {
    id: string;
    branch_id: string;
    start_time: string;
    end_time: string;
    room_or_service: string | null;
    is_on_call: boolean;
    branch_name: string | null;
  } | null;
  open: {
    id: string;
    clock_in_at: string;
    within_geofence: boolean | null;
  } | null;
  last: { clock_in_at: string; clock_out_at: string | null } | null;
  branch: {
    id: string;
    name: string | null;
    has_fence: boolean;
    radius_m: number;
  } | null;
};
