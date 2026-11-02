import { describe, expect, it } from "vitest";
import {
  isoDate,
  known,
  ownerEmails,
  parseOperatingHours,
  stateCode,
  toBranch,
  toJobRoles,
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
