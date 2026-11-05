import { describe, expect, it } from "vitest";
import {
  cents,
  fromCents,
  leftThisMonth,
  mileageAmount,
  parseClaim,
  parseClaimType,
} from "./logic";

const TYPE = "11111111-1111-4111-8111-111111111111";
const ROLE = "22222222-2222-4222-8222-222222222222";
const TODAY = "2026-12-10";

function form(values: Record<string, string | string[]>) {
  const data = new FormData();
  for (const [k, v] of Object.entries(values))
    for (const x of [v].flat()) data.append(k, x);
  return data;
}

describe("claim money", () => {
  it("counts in whole sen, without float drift", () => {
    expect(cents("0.10") + cents("0.20")).toBe(30);
    expect(cents("150")).toBe(15000);
    expect(cents("12.5")).toBe(1250);
    expect(cents(null)).toBe(0);
    expect(fromCents(30)).toBe("0.30");
  });

  it("shows what is left of a monthly limit, never below zero", () => {
    expect(leftThisMonth("300.00", "120.50")).toBe("179.50");
    expect(leftThisMonth("300.00", "350")).toBe("0.00");
    expect(leftThisMonth(null, "999")).toBeNull();
  });

  it("works out mileage as km × rate, rounded to the sen", () => {
    expect(mileageAmount("42.5", "0.60")).toBe("25.50");
    expect(mileageAmount("33.3", "0.55")).toBe("18.32");
    expect(mileageAmount("10", null)).toBeNull();
    expect(mileageAmount("0", "0.60")).toBeNull();
  });
});

describe("parseClaim", () => {
  const base = {
    claim_type_id: TYPE,
    expense_date: "2026-12-08",
    description: "Parking",
  };

  it("accepts a normal claim", () => {
    const r = parseClaim(form({ ...base, amount: "12.50" }), false, TODAY);
    expect(r.ok && r.values).toMatchObject({
      amount: "12.50",
      distance_km: null,
      description: "Parking",
    });
  });

  it("refuses a future date, a missing amount and a missing description", () => {
    const r = parseClaim(
      form({ claim_type_id: TYPE, expense_date: "2026-12-11" }),
      false,
      TODAY,
    );
    expect(r.ok).toBe(false);
    if (!r.ok)
      expect(r.errors).toMatchObject({
        expense_date: "futureDate",
        amount: "required",
        description: "required",
      });
  });

  it("refuses a zero amount", () => {
    const r = parseClaim(form({ ...base, amount: "0" }), false, TODAY);
    expect(!r.ok && r.errors.amount).toBe("invalidMoney");
  });

  it("takes a distance, not an amount, for mileage", () => {
    const r = parseClaim(
      form({
        ...base,
        distance_km: "42.5",
        trip_from: "Centre",
        trip_to: "Klang",
        amount: "999",
      }),
      true,
      TODAY,
    );
    expect(r.ok && r.values).toMatchObject({
      amount: null,
      distance_km: 42.5,
      trip_from: "Centre",
      trip_to: "Klang",
    });
    const bad = parseClaim(form({ ...base, distance_km: "-3" }), true, TODAY);
    expect(!bad.ok && bad.errors.distance_km).toBe("invalidNumber");
  });
});

describe("parseClaimType", () => {
  it("reads limits, flags and the roles that may claim", () => {
    const r = parseClaimType(
      form({
        name_en: "Parking",
        name_ms: "Letak kereta",
        monthly_limit: "200",
        per_claim_limit: "50",
        is_taxable: "on",
        eligible_role_ids: [ROLE, "nope"],
      }),
    );
    expect(r.ok && r.values).toMatchObject({
      monthly_limit: "200.00",
      per_claim_limit: "50.00",
      is_taxable: true,
      requires_receipt: false,
      eligible_role_ids: [ROLE],
    });
  });

  it("leaves blank limits empty and refuses a per-claim limit above the monthly one", () => {
    const blank = parseClaimType(form({ name_en: "Meals", name_ms: "Makan" }));
    expect(blank.ok && blank.values).toMatchObject({
      monthly_limit: null,
      per_claim_limit: null,
      eligible_role_ids: [],
    });
    const r = parseClaimType(
      form({
        name_en: "Meals",
        name_ms: "Makan",
        monthly_limit: "100",
        per_claim_limit: "150",
      }),
    );
    expect(!r.ok && r.errors.per_claim_limit).toBe("perClaimOverMonthly");
  });
});
