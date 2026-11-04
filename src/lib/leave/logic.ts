// Step 9 form parsers and calendar rules. Pure, so they are unit-tested; the database
// enforces the same rules (apply_leave, leave_policies floor trigger).
import { readCheckbox, readChoice, readInteger } from "@/lib/people/fields";
import {
  done,
  isUuid,
  readDate,
  readText,
  type FieldErrors,
  type Parsed,
} from "@/lib/settings/form";
import type { LeaveBalance, StatutoryMinimum, TeamLeave } from "./types";

/** "12.0" → "12", "2.5" → "2.5". */
export function days(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return "";
  const n = Number(value);
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/** Left to take: entitlement + carried (less forfeited) + adjustments − taken − pending. */
export function available(b: LeaveBalance): number | null {
  if (b.entitled === null) return null;
  return (
    Number(b.entitled) +
    Number(b.carried_forward) -
    Number(b.carry_forfeited) +
    Number(b.adjusted) -
    Number(b.taken) -
    Number(b.pending)
  );
}

/** Everything this year's balance can give (for "9 of 12"). */
export function totalAllowance(b: LeaveBalance): number | null {
  if (b.entitled === null) return null;
  return (
    Number(b.entitled) +
    Number(b.carried_forward) -
    Number(b.carry_forfeited) +
    Number(b.adjusted)
  );
}

export type ApplyValues = {
  leave_type_id: string;
  start_date: string;
  end_date: string;
  half_day: "am" | "pm" | null;
  reason: string | null;
};

/** LVE-05 apply form. One calendar year per request; a half day is a single day. */
export function parseApply(formData: FormData): Parsed<ApplyValues> {
  const errors: FieldErrors = {};
  const type = String(formData.get("leave_type_id") ?? "");
  if (!isUuid(type)) errors.leave_type_id = "required";
  const start = readDate(formData, "start_date", errors);
  if (!start && !errors.start_date) errors.start_date = "required";
  let end = readDate(formData, "end_date", errors);
  if (!end && start && !errors.end_date) end = start;
  if (start && end) {
    if (end < start) errors.end_date = "beforeStart";
    else if (start.slice(0, 4) !== end.slice(0, 4)) errors.end_date = "oneYear";
  }
  const half = readChoice(formData, "half_day", ["am", "pm"] as const, errors);
  if (half && start && end && start !== end) errors.half_day = "halfDaySingle";
  return done(
    {
      leave_type_id: type,
      start_date: start ?? "",
      end_date: end ?? "",
      half_day: half,
      reason: readText(formData, "reason", 1000, errors),
    },
    errors,
  );
}

export type PolicyValues = {
  min_service_months: number;
  max_service_months: number | null;
  days_per_year: number;
  carry_forward_max: number;
  carry_forward_expiry_months: number | null;
};

const readDays = (formData: FormData, name: string, errors: FieldErrors) => {
  const raw = String(formData.get(name) ?? "").trim();
  if (raw === "") return null;
  if (!/^\d{1,3}(\.[05])?$/.test(raw) || Number(raw) > 366) {
    errors[name] = "invalidNumber";
    return null;
  }
  return Number(raw);
};

/** Statutory minimum for a band (the highest minimum of any overlapping statutory band). */
export function floorFor(
  code: string,
  min: number,
  max: number | null,
  minimums: readonly StatutoryMinimum[],
) {
  const hits = minimums.filter(
    (m) =>
      m.leave_code === code &&
      m.min_service_months < (max ?? Infinity) &&
      (m.max_service_months ?? Infinity) > min,
  );
  return hits.length ? Math.max(...hits.map((m) => Number(m.days))) : null;
}

/** LVE-02 policy band: never below the Employment Act for statutory types. */
export function parsePolicy(
  formData: FormData,
  code: string,
  minimums: readonly StatutoryMinimum[],
): Parsed<PolicyValues> {
  const errors: FieldErrors = {};
  const min =
    readInteger(formData, "min_service_months", errors, { min: 0, max: 600 }) ??
    0;
  const max = readInteger(formData, "max_service_months", errors, {
    min: 1,
    max: 600,
  });
  if (max !== null && max <= min) errors.max_service_months = "rangeOrder";
  const perYear = readDays(formData, "days_per_year", errors);
  if (perYear === null && !errors.days_per_year)
    errors.days_per_year = "required";
  const floor = floorFor(code, min, max, minimums);
  if (perYear !== null && floor !== null && perYear < floor)
    errors.days_per_year = "belowStatutoryMinimum";
  const carry = readDays(formData, "carry_forward_max", errors) ?? 0;
  const expiry = readInteger(formData, "carry_forward_expiry_months", errors, {
    min: 1,
    max: 12,
  });
  return done(
    {
      min_service_months: min,
      max_service_months: max,
      days_per_year: perYear ?? 0,
      carry_forward_max: carry,
      carry_forward_expiry_months: carry > 0 ? expiry : null,
    },
    errors,
  );
}

export type LeaveTypeValues = {
  name_en: string;
  name_ms: string;
  is_paid: boolean;
  requires_attachment: boolean;
};

export function parseLeaveType(formData: FormData): Parsed<LeaveTypeValues> {
  const errors: FieldErrors = {};
  const name_en = readText(formData, "name_en", 80, errors);
  const name_ms = readText(formData, "name_ms", 80, errors);
  if (!name_en) errors.name_en = "required";
  if (!name_ms) errors.name_ms = "required";
  return done(
    {
      name_en: name_en ?? "",
      name_ms: name_ms ?? "",
      is_paid: readCheckbox(formData, "is_paid"),
      requires_attachment: readCheckbox(formData, "requires_attachment"),
    },
    errors,
  );
}

/** A company holiday (Settings > Public holidays). */
export function parseHoliday(formData: FormData) {
  const errors: FieldErrors = {};
  const date = readDate(formData, "holiday_date", errors);
  if (!date && !errors.holiday_date) errors.holiday_date = "required";
  const name_en = readText(formData, "name_en", 120, errors);
  const name_ms = readText(formData, "name_ms", 120, errors);
  if (!name_en) errors.name_en = "required";
  return done(
    {
      holiday_date: date ?? "",
      name_en: name_en ?? "",
      name_ms: name_ms ?? name_en ?? "",
    },
    errors,
  );
}

/** Every date from start to end (YYYY-MM-DD). */
export function eachDay(start: string, end: string) {
  const out: string[] = [];
  const d = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (d <= last) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

export function overlaps(
  a: { start_date: string; end_date: string },
  b: { start_date: string; end_date: string },
) {
  return a.start_date <= b.end_date && b.start_date <= a.end_date;
}

/**
 * LVE-06 clashes: other people from the same branch (or with no branch, the same job role)
 * off on any of the same days, for a request being decided.
 */
export function clashesFor(
  request: {
    request_id?: string;
    employee_id: string;
    start_date: string;
    end_date: string;
  },
  person: { branch_id: string | null; job_role_id: string | null },
  others: readonly TeamLeave[],
) {
  return others.filter(
    (o) =>
      o.employee_id !== request.employee_id &&
      overlaps(o, request) &&
      ((person.branch_id !== null && o.branch_id === person.branch_id) ||
        (person.branch_id === null &&
          person.job_role_id !== null &&
          o.job_role_id === person.job_role_id)),
  );
}

/** People off per day (approved and pending), for the calendar. */
export function outByDay(
  leave: readonly TeamLeave[],
  from: string,
  to: string,
) {
  const map = new Map<string, TeamLeave[]>();
  for (const day of eachDay(from, to)) map.set(day, []);
  for (const l of leave) {
    for (const day of eachDay(
      l.start_date > from ? l.start_date : from,
      l.end_date < to ? l.end_date : to,
    ))
      map.get(day)?.push(l);
  }
  return map;
}

/** Monday-first weeks covering a month, for the calendar grid ("" = outside the month). */
export function monthGrid(year: number, month: number) {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const lead = (first.getUTCDay() + 6) % 7;
  const cells: string[] = Array(lead).fill("");
  for (let d = 1; d <= daysInMonth; d++)
    cells.push(
      `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
    );
  while (cells.length % 7) cells.push("");
  const weeks: string[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** "2026-11" from search params, else the given month. */
export function parseMonth(value: unknown, fallback: string) {
  const text =
    typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value)
      ? value
      : fallback.slice(0, 7);
  return {
    year: Number(text.slice(0, 4)),
    month: Number(text.slice(5, 7)),
    key: text,
  };
}

export function shiftMonth(key: string, by: number) {
  const d = new Date(
    Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1 + by, 1),
  );
  return d.toISOString().slice(0, 7);
}
