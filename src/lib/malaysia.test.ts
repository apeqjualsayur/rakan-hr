import { describe, expect, it } from "vitest";
import { STATE_CODES } from "../../scripts/lib/company-config.mjs";
import { isStateCode, MALAYSIAN_STATES, stateName } from "./malaysia";

describe("malaysia", () => {
  it("lists the same states as the seed script", () => {
    const fromSeed = Object.entries(STATE_CODES)
      .map(([name, code]) => [code, name])
      .sort();
    const fromApp = MALAYSIAN_STATES.map((s) => [s.code, s.name.toLowerCase()]);
    expect(fromApp).toEqual(fromSeed);
  });

  it("looks up names and rejects unknown codes", () => {
    expect(stateName("MY-14")).toBe("Wilayah Persekutuan Kuala Lumpur");
    expect(stateName("MY-99")).toBeNull();
    expect(isStateCode("MY-10")).toBe(true);
    expect(isStateCode("Selangor")).toBe(false);
  });
});
