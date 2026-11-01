import { describe, expect, it } from "vitest";
import {
  known,
  ownerEmails,
  parseOperatingHours,
  stateCode,
  toBranch,
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
