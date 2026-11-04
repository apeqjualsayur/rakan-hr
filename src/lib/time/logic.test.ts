import { describe, expect, it } from "vitest";
import {
  addDays,
  hoursBetween,
  parseOt,
  parseShift,
  parseWeek,
  shiftHours,
  weekDays,
  weekStart,
} from "./logic";

const form = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [k, v] of Object.entries(values)) data.set(k, v);
  return data;
};

describe("weeks", () => {
  it("weeks start on Monday", () => {
    expect(weekStart("2026-11-15")).toBe("2026-11-09"); // Sunday → previous Monday
    expect(weekStart("2026-11-16")).toBe("2026-11-16");
    expect(weekDays("2026-11-16")).toEqual([
      "2026-11-16",
      "2026-11-17",
      "2026-11-18",
      "2026-11-19",
      "2026-11-20",
      "2026-11-21",
      "2026-11-22",
    ]);
    expect(addDays("2026-12-28", 7)).toBe("2027-01-04");
    expect(parseWeek("2026-11-19", "2026-11-04")).toBe("2026-11-16");
    expect(parseWeek("nonsense", "2026-11-04")).toBe("2026-11-02");
  });

  it("paid hours are the shift less its break", () => {
    expect(shiftHours("08:30", "17:30", 60)).toBe(8);
    expect(shiftHours("08:30:00", "13:00:00", 0)).toBe(4.5);
    expect(hoursBetween("2026-11-16T00:30:00Z", "2026-11-16T09:15:00Z")).toBe(
      8.75,
    );
    expect(hoursBetween("2026-11-16T00:30:00Z", null)).toBeNull();
  });
});

describe("forms", () => {
  const shift = {
    employee_id: "6a2b4c8d-0000-4000-8000-000000000001",
    shift_date: "2026-11-16",
    start_time: "08:30",
    end_time: "17:30",
    break_minutes: "60",
  };
  it("ATT-02 a shift ends after it starts and the break leaves paid time", () => {
    expect(parseShift(form(shift)).ok).toBe(true);
    const back = parseShift(form({ ...shift, end_time: "08:00" }));
    expect(!back.ok && back.errors.end_time).toBe("endBeforeStart");
    const longBreak = parseShift(
      form({ ...shift, end_time: "09:00", break_minutes: "60" }),
    );
    expect(!longBreak.ok && longBreak.errors.break_minutes).toBe(
      "invalidNumber",
    );
  });

  it("ATT-04 OT hours: more than 0, at most 24, in quarter hours, with a reason", () => {
    expect(
      parseOt(
        form({ work_date: "2026-11-10", hours: "4", reason: "Late case" }),
      ).ok,
    ).toBe(true);
    expect(
      parseOt(form({ work_date: "2026-11-10", hours: "1.25", reason: "x" })).ok,
    ).toBe(true);
    const odd = parseOt(
      form({ work_date: "2026-11-10", hours: "1.3", reason: "x" }),
    );
    expect(!odd.ok && odd.errors.hours).toBe("invalidHours");
    const none = parseOt(
      form({ work_date: "2026-11-10", hours: "25", reason: "" }),
    );
    expect(!none.ok && none.errors).toMatchObject({
      hours: "invalidHours",
      reason: "required",
    });
  });
});
