import { describe, expect, it } from "vitest";
import { parseMyKad } from "../../src/lib/people/mykad";
import { testEmail, testPeople } from "./test-people.mjs";

describe("testPeople (dev seed)", () => {
  const people = testPeople("someone@gmail.com");

  it("has eight people with valid fake ICs whose birth date and gender match", () => {
    expect(people).toHaveLength(8);
    for (const p of people) {
      const ic = parseMyKad(p.id_no, "2026-11-02");
      expect(ic.ok, p.full_name).toBe(true);
      if (!ic.ok) continue;
      expect(ic.value.dateOfBirth, p.full_name).toBe(p.date_of_birth);
      expect(ic.value.gender, p.full_name).toBe(p.gender);
    }
  });

  it("includes people born in 2000 or later", () => {
    expect(
      people.filter((p) => p.date_of_birth >= "2000").length,
    ).toBeGreaterThanOrEqual(2);
  });

  it("covers every role in company-config.yaml and has reporting lines", () => {
    expect(new Set(people.map((p) => p.role))).toEqual(
      new Set([
        "Speech-Language Therapist",
        "Occupational Therapist",
        "Centre Administrator",
      ]),
    );
    const ids = new Set(people.map((p) => p.id));
    for (const p of people)
      if (p.manager_id) expect(ids.has(p.manager_id)).toBe(true);
  });

  it("gives each person a unique work email", () => {
    expect(new Set(people.map((p) => p.work_email)).size).toBe(8);
  });
});

describe("testEmail", () => {
  it("plus-addresses Gmail owners and falls back to example.test", () => {
    expect(testEmail("Owner+x@Gmail.com", "aina")).toBe(
      "owner+rakan-aina@gmail.com",
    );
    expect(testEmail("hr@clinic.my", "aina")).toBe("aina@example.test");
  });
});
