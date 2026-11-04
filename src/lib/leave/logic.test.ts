import { describe, expect, it } from "vitest";
import {
  available,
  clashesFor,
  days,
  floorFor,
  monthGrid,
  outByDay,
  parseApply,
  parsePolicy,
  shiftMonth,
} from "./logic";
import type { LeaveBalance, StatutoryMinimum, TeamLeave } from "./types";

const form = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [k, v] of Object.entries(values)) data.set(k, v);
  return data;
};

const MINIMUMS: StatutoryMinimum[] = [
  {
    leave_code: "ANNUAL",
    min_service_months: 0,
    max_service_months: 24,
    days: "8",
  },
  {
    leave_code: "ANNUAL",
    min_service_months: 24,
    max_service_months: 60,
    days: "12",
  },
  {
    leave_code: "ANNUAL",
    min_service_months: 60,
    max_service_months: null,
    days: "16",
  },
];

describe("leave forms", () => {
  it("LVE-05: one year per request, half days are single days", () => {
    const type = "6a2b4c8d-0000-4000-8000-000000000001";
    const ok = parseApply(
      form({ leave_type_id: type, start_date: "2026-12-14" }),
    );
    expect(ok.ok && ok.values).toMatchObject({
      start_date: "2026-12-14",
      end_date: "2026-12-14",
    });
    const year = parseApply(
      form({
        leave_type_id: type,
        start_date: "2026-12-30",
        end_date: "2027-01-02",
      }),
    );
    expect(!year.ok && year.errors.end_date).toBe("oneYear");
    const half = parseApply(
      form({
        leave_type_id: type,
        start_date: "2026-12-14",
        end_date: "2026-12-15",
        half_day: "am",
      }),
    );
    expect(!half.ok && half.errors.half_day).toBe("halfDaySingle");
  });

  it("LVE-02: a band below the Employment Act is refused before it reaches the database", () => {
    expect(floorFor("ANNUAL", 0, 24, MINIMUMS)).toBe(8);
    expect(floorFor("ANNUAL", 12, 36, MINIMUMS)).toBe(12); // overlaps both bands
    expect(floorFor("COMPASSIONATE", 0, null, MINIMUMS)).toBeNull();
    const low = parsePolicy(
      form({
        min_service_months: "0",
        max_service_months: "24",
        days_per_year: "7",
      }),
      "ANNUAL",
      MINIMUMS,
    );
    expect(!low.ok && low.errors.days_per_year).toBe("belowStatutoryMinimum");
    const ok = parsePolicy(
      form({
        min_service_months: "0",
        max_service_months: "24",
        days_per_year: "12",
        carry_forward_max: "5",
        carry_forward_expiry_months: "3",
      }),
      "ANNUAL",
      MINIMUMS,
    );
    expect(ok.ok && ok.values).toEqual({
      min_service_months: 0,
      max_service_months: 24,
      days_per_year: 12,
      carry_forward_max: 5,
      carry_forward_expiry_months: 3,
    });
  });
});

describe("balances and calendar", () => {
  const balance = (over: Partial<LeaveBalance>): LeaveBalance => ({
    id: "b",
    employee_id: "e",
    leave_type_id: "t",
    year: 2026,
    entitled: "12.0",
    carried_forward: "3.0",
    carry_expires_on: "2026-03-31",
    carry_forfeited: "1.0",
    adjusted: "0.5",
    adjust_note: null,
    taken: "4.0",
    pending: "2.0",
    ...over,
  });

  it("left = entitled + carried − forfeited + adjusted − taken − pending; unlimited is null", () => {
    expect(available(balance({}))).toBe(8.5);
    expect(available(balance({ entitled: null }))).toBeNull();
    expect(days("12.0")).toBe("12");
    expect(days("2.5")).toBe("2.5");
  });

  const leave = (over: Partial<TeamLeave>): TeamLeave => ({
    request_id: "r",
    employee_id: "e1",
    full_name: "A",
    branch_id: "b1",
    job_role_id: null,
    start_date: "2026-11-03",
    end_date: "2026-11-04",
    half_day: null,
    days: "2",
    status: "approved",
    leave_type_id: null,
    type_code: null,
    type_name_en: null,
    type_name_ms: null,
    ...over,
  });

  it("LVE-06: clashes are others from the same branch off on overlapping days", () => {
    const others = [
      leave({ request_id: "1", employee_id: "e2", full_name: "B" }),
      leave({
        request_id: "2",
        employee_id: "e3",
        full_name: "C",
        branch_id: "b2",
      }),
      leave({
        request_id: "3",
        employee_id: "e4",
        full_name: "D",
        start_date: "2026-11-05",
        end_date: "2026-11-05",
      }),
    ];
    const clashes = clashesFor(
      { employee_id: "e1", start_date: "2026-11-04", end_date: "2026-11-04" },
      { branch_id: "b1", job_role_id: null },
      others,
    );
    expect(clashes.map((c) => c.full_name)).toEqual(["B"]);
    const byDay = outByDay(others, "2026-11-03", "2026-11-05");
    expect(byDay.get("2026-11-04")?.length).toBe(2);
    expect(byDay.get("2026-11-05")?.map((l) => l.full_name)).toEqual(["D"]);
  });

  it("month grid starts on Monday", () => {
    const weeks = monthGrid(2026, 11); // 1 Nov 2026 is a Sunday
    expect(weeks[0]).toEqual(["", "", "", "", "", "", "2026-11-01"]);
    expect(weeks.flat().filter(Boolean)).toHaveLength(30);
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  });
});
