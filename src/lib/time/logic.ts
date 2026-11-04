// Step 10 form parsers and week arithmetic. Pure, so they are unit-tested; the database
// enforces the same rules (roster trigger, request_ot, calc_ot).
import { readCheckbox, readInteger } from "@/lib/people/fields";
import {
  done,
  isUuid,
  readDate,
  readText,
  type FieldErrors,
  type Parsed,
} from "@/lib/settings/form";

/** Monday of the week a date falls in (YYYY-MM-DD). */
export function weekStart(iso: string) {
  const d = new Date(`${iso}T00:00:00Z`);
  const back = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The 7 dates of a week from its Monday. */
export function weekDays(monday: string) {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/** "?week=2026-11-16" (any date in it) → that week's Monday; else this week's. */
export function parseWeek(value: unknown, today: string) {
  return typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value))
    ? weekStart(value)
    : weekStart(today);
}

/** "08:30:00" → "08:30". */
export const hhmm = (time: string) => time.slice(0, 5);

/** Paid hours of a shift (length less the break). */
export function shiftHours(start: string, end: string, breakMinutes: number) {
  const mins = (t: string) =>
    Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  return (
    Math.round(((mins(end) - mins(start) - breakMinutes) / 60) * 100) / 100
  );
}

/** Hours between two instants (attendance), to 2 decimals. */
export function hoursBetween(from: string, to: string | null) {
  if (!to) return null;
  return (
    Math.round(((Date.parse(to) - Date.parse(from)) / 3_600_000) * 100) / 100
  );
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export type ShiftValues = {
  employee_id: string;
  shift_date: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
  room_or_service: string | null;
  is_on_call: boolean;
  notes: string | null;
};

/** ATT-02 one shift. Same day only (no overnight shifts in the MVP). */
export function parseShift(formData: FormData): Parsed<ShiftValues> {
  const errors: FieldErrors = {};
  const employee = String(formData.get("employee_id") ?? "");
  if (!isUuid(employee)) errors.employee_id = "required";
  const date = readDate(formData, "shift_date", errors);
  if (!date && !errors.shift_date) errors.shift_date = "required";
  const start = String(formData.get("start_time") ?? "").trim();
  const end = String(formData.get("end_time") ?? "").trim();
  if (!TIME.test(start)) errors.start_time = "required";
  if (!TIME.test(end)) errors.end_time = "required";
  else if (TIME.test(start) && end <= start) errors.end_time = "endBeforeStart";
  const brk =
    readInteger(formData, "break_minutes", errors, { min: 0, max: 240 }) ?? 0;
  if (
    !errors.end_time &&
    TIME.test(start) &&
    TIME.test(end) &&
    shiftHours(start, end, brk) <= 0
  )
    errors.break_minutes = "invalidNumber";
  return done(
    {
      employee_id: employee,
      shift_date: date ?? "",
      start_time: start,
      end_time: end,
      break_minutes: brk,
      room_or_service: readText(formData, "room_or_service", 80, errors),
      is_on_call: readCheckbox(formData, "is_on_call"),
      notes: readText(formData, "notes", 300, errors),
    },
    errors,
  );
}

export type OtValues = {
  work_date: string;
  hours: number;
  reason: string | null;
};

/** ATT-04 OT request: up to 24 hours, in quarter hours. */
export function parseOt(formData: FormData): Parsed<OtValues> {
  const errors: FieldErrors = {};
  const date = readDate(formData, "work_date", errors);
  if (!date && !errors.work_date) errors.work_date = "required";
  const raw = String(formData.get("hours") ?? "").trim();
  const hours = Number(raw);
  if (raw === "") errors.hours = "required";
  else if (
    !/^\d{1,2}(\.\d{1,2})?$/.test(raw) ||
    hours <= 0 ||
    hours > 24 ||
    (hours * 4) % 1 !== 0
  )
    errors.hours = "invalidHours";
  const reason = readText(formData, "reason", 500, errors);
  if (!reason) errors.reason = "required";
  return done({ work_date: date ?? "", hours, reason }, errors);
}
