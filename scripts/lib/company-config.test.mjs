import { describe, expect, it } from "vitest";
import {
  isoDate,
  known,
  ownerEmails,
  parseOperatingHours,
  stateCode,
  toBranch,
  toJobOpenings,
  toLeavePolicy,
  toWorkPattern,
  toJobRoles,
  toRoleRequirements,
  toTenant,
} from "./company-config.mjs";

describe("known", () => {
  it("treats TBC, not_applicable and blanks as unknown", () => {
    expect(known("TBC")).toBeNull();
    expect(known("tbc")).toBeNull();
    expect(known("not_applicable")).toBeNull();
    expect(known("  ")).toBeNull();
    expect(known(undefined)).toBeNull();
    expect(known(" Rakan ")).toBe("Rakan");
  });
});

describe("stateCode", () => {
  it("maps state names to ISO codes", () => {
    expect(stateCode("Wilayah Persekutuan Kuala Lumpur")).toBe("MY-14");
    expect(stateCode("selangor")).toBe("MY-10");
    expect(stateCode("TBC")).toBeNull();
  });
  it("rejects an unknown state rather than guessing", () => {
    expect(() => stateCode("Atlantis")).toThrow(/Unknown Malaysian state/);
  });
});

describe("parseOperatingHours", () => {
  it("expands day ranges", () => {
    const hours = parseOperatingHours("Mon-Fri 08:30-17:30, Sat 08:30-13:00");
    expect(Object.keys(hours)).toEqual([
      "mon",
      "tue",
      "wed",
      "thu",
      "fri",
      "sat",
    ]);
    expect(hours.fri).toEqual([{ open: "08:30", close: "17:30" }]);
    expect(hours.sat).toEqual([{ open: "08:30", close: "13:00" }]);
    expect(hours.sun).toBeUndefined();
  });
  it("returns no hours when TBC and rejects text it cannot read", () => {
    expect(parseOperatingHours("TBC")).toEqual({});
    expect(() => parseOperatingHours("weekdays 9 to 5")).toThrow();
  });
});

describe("toTenant / toBranch", () => {
  const config = {
    company: { legal_name: "TBC", state: "Selangor", is_msme: true },
    employer_numbers: { epf_employer_no: "TBC", hrdcorp_no: "not_applicable" },
    branch: { name: "TBC", geofence_lat: "TBC", geofence_radius_m: 100 },
    credential_enforcement: "soft",
  };
  it("turns TBC into null and keeps known values", () => {
    expect(toTenant(config)).toMatchObject({
      legal_name: null,
      state_code: "MY-10",
      is_msme: true,
      epf_employer_no: null,
      hrdcorp_no: null,
      credential_enforcement: "soft",
    });
    expect(toBranch(config)).toMatchObject({
      name: null,
      geo_lat: null,
      geo_radius_m: 100,
      state_code: "MY-10",
    });
  });
});

describe("isoDate", () => {
  it("keeps real YYYY-MM-DD dates and turns TBC into null", () => {
    expect(isoDate("2026-12-01")).toBe("2026-12-01");
    expect(isoDate(new Date("2026-12-01T00:00:00Z"))).toBe("2026-12-01");
    expect(isoDate("TBC")).toBeNull();
    expect(isoDate(undefined)).toBeNull();
  });
  it("rejects dates it cannot read rather than guessing", () => {
    expect(() => isoDate("1/12/2026")).toThrow(/YYYY-MM-DD/);
    expect(() => isoDate("2026-02-30")).toThrow(/YYYY-MM-DD/);
  });
  it("feeds the first hire and payday dates into the tenant", () => {
    const tenant = toTenant({
      company: {
        first_hire_target_date: "2026-12-01",
        first_payday_target_date: "TBC",
      },
    });
    expect(tenant.first_hire_date).toBe("2026-12-01");
    expect(tenant.first_payday_date).toBeNull();
  });
});

describe("ownerEmails", () => {
  it("lower-cases and de-duplicates", () => {
    expect(
      ownerEmails({
        people: {
          owner_emails: ["A@Example.com", "a@example.com", "b@example.com"],
        },
      }),
    ).toEqual(["a@example.com", "b@example.com"]);
  });
  it("requires at least one real email", () => {
    expect(() => ownerEmails({ people: { owner_emails: ["TBC"] } })).toThrow(
      /at least one/,
    );
    expect(() => ownerEmails({ people: {} })).toThrow(/at least one/);
    expect(() =>
      ownerEmails({ people: { owner_emails: ["not-an-email"] } }),
    ).toThrow(/Not an email/);
  });
});

describe("toJobRoles", () => {
  it("maps roles_to_hire to job roles in yaml order", () => {
    expect(
      toJobRoles({
        roles_to_hire: [
          { title: "Speech-Language Therapist", clinical: true },
          { title: "Centre Administrator", clinical: false },
          { title: "TBC" },
        ],
      }),
    ).toEqual([
      { name: "Speech-Language Therapist", is_clinical: true, sort_order: 10 },
      { name: "Centre Administrator", is_clinical: false, sort_order: 20 },
    ]);
    expect(toJobRoles({})).toEqual([]);
  });
  it("refuses the same title twice", () => {
    expect(() =>
      toJobRoles({ roles_to_hire: [{ title: "OT" }, { title: "ot" }] }),
    ).toThrow(/twice/);
  });
});

describe("toRoleRequirements", () => {
  it("maps each role's credential lists, blocking the roster for clinical mandatory ones", () => {
    expect(
      toRoleRequirements({
        roles_to_hire: [
          {
            title: "OT",
            clinical: true,
            credentials: { mandatory: ["BLS"], optional: ["HEPB_VAX"] },
          },
          {
            title: "Admin",
            clinical: false,
            credentials: { mandatory: ["SAFEGUARDING"] },
          },
          { title: "No list" },
        ],
      }),
    ).toEqual([
      {
        role: "OT",
        code: "BLS",
        requirement: "mandatory",
        blocks_roster: true,
      },
      {
        role: "OT",
        code: "HEPB_VAX",
        requirement: "optional",
        blocks_roster: false,
      },
      {
        role: "Admin",
        code: "SAFEGUARDING",
        requirement: "mandatory",
        blocks_roster: false,
      },
    ]);
  });
  it("refuses unknown codes and duplicates", () => {
    expect(() =>
      toRoleRequirements({
        roles_to_hire: [{ title: "X", credentials: { mandatory: ["NOPE"] } }],
      }),
    ).toThrow(/unknown credential code/);
    expect(() =>
      toRoleRequirements({
        roles_to_hire: [
          {
            title: "X",
            credentials: { mandatory: ["BLS"], optional: ["BLS"] },
          },
        ],
      }),
    ).toThrow(/twice/);
  });
  it("the real company-config.yaml is valid", async () => {
    const { readFileSync } = await import("node:fs");
    const { parse } = await import("yaml");
    const rows = toRoleRequirements(
      parse(readFileSync("_specs/hr-system/company-config.yaml", "utf8")),
    );
    expect(rows.length).toBeGreaterThan(0);
  });
});

describe("toJobOpenings", () => {
  it("opens one opening per role with its employment type and pay model", () => {
    expect(
      toJobOpenings({
        roles_to_hire: [
          {
            title: "Occupational Therapist",
            employment_type: "full_time",
            pay_model: "monthly",
            headcount: 2,
          },
          {
            title: "Locum SLT",
            employment_type: "locum_contractor",
            pay_model: "per_session",
          },
          { title: "TBC" },
        ],
      }),
    ).toEqual([
      {
        role: "Occupational Therapist",
        title: "Occupational Therapist",
        employment_type: "full_time",
        pay_model: "monthly",
        headcount: 2,
      },
      {
        role: "Locum SLT",
        title: "Locum SLT",
        employment_type: "locum_contractor",
        pay_model: "per_session",
        headcount: null,
      },
    ]);
  });

  it("refuses a pay model the system does not have instead of guessing", () => {
    expect(() =>
      toJobOpenings({ roles_to_hire: [{ title: "SLT", pay_model: "hybrid" }] }),
    ).toThrow(/hybrid/);
  });
});

describe("toWorkPattern", () => {
  it("5.5 days with Sunday rest: Saturday is a half day", () => {
    expect(
      toWorkPattern({
        work_pattern: { rest_day: "Sunday", work_days_per_week: 5.5 },
      }),
    ).toEqual({
      rest_day: 0,
      off_days: [],
      half_days: [6],
    });
  });
  it("5 days: Saturday is an off day", () => {
    expect(
      toWorkPattern({
        work_pattern: { rest_day: "Sunday", work_days_per_week: 5 },
      }).off_days,
    ).toEqual([6]);
  });
  it("refuses an unknown rest day", () => {
    expect(() =>
      toWorkPattern({
        work_pattern: { rest_day: "TBC", work_days_per_week: 5 },
      }),
    ).toThrow();
  });
});

describe("toLeavePolicy", () => {
  it("maps annual and sick leave bands, carry-forward on annual only, and extra types", () => {
    const { policies, extraTypes } = toLeavePolicy({
      leave_policy: {
        annual_leave_days: {
          under_2_years: 12,
          two_to_5_years: 14,
          over_5_years: 18,
        },
        sick_leave_days: { under_2_years: 14 },
        carry_forward_max_days: 5,
        carry_forward_expiry_months: 3,
        extra_leave_types: ["compassionate", "exam"],
      },
    });
    expect(policies).toContainEqual({
      code: "ANNUAL",
      min_service_months: 24,
      max_service_months: 60,
      days_per_year: 14,
      carry_forward_max: 5,
      carry_forward_expiry_months: 3,
    });
    expect(policies).toContainEqual({
      code: "SICK",
      min_service_months: 0,
      max_service_months: 24,
      days_per_year: 14,
      carry_forward_max: 0,
      carry_forward_expiry_months: null,
    });
    expect(policies).toHaveLength(4);
    expect(extraTypes.map((t) => t.code)).toEqual(["COMPASSIONATE", "EXAM"]);
  });
});
