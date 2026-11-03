import { describe, expect, it } from "vitest";
import {
  ackStatus,
  consentText,
  parseAnnouncement,
  parseAudience,
  parsePolicy,
  policyCode,
  sameName,
} from "./logic";

const BRANCH = "11111111-1111-4111-8111-111111111111";

function form(values: Record<string, string | string[]>) {
  const data = new FormData();
  for (const [k, v] of Object.entries(values)) {
    for (const item of [v].flat()) data.append(k, item);
  }
  return data;
}

describe("audience", () => {
  it("is everyone, or the chosen branches / job roles", () => {
    expect(parseAudience(form({ audience_type: "all" }), {})).toEqual({
      type: "all",
    });
    expect(
      parseAudience(
        form({
          audience_type: "branches",
          audience_ids: [BRANCH, BRANCH, "x"],
        }),
        {},
      ),
    ).toEqual({ type: "branches", ids: [BRANCH] });
  });
  it("needs at least one branch or role when not everyone", () => {
    const errors = {};
    parseAudience(form({ audience_type: "job_roles" }), errors);
    expect(errors).toEqual({ audience_ids: "required" });
  });
});

describe("parsePolicy (POL-02)", () => {
  it("makes a code from a custom name", () => {
    expect(policyCode("Safeguarding policy (2026)")).toBe(
      "SAFEGUARDING_POLICY_2026",
    );
    const r = parsePolicy(
      form({
        code: "OTHER",
        code_other: "Dress code",
        title_en: "Dress code",
        title_ms: "Kod pakaian",
        audience_type: "all",
        requires_signature: "on",
      }),
    );
    expect(r).toEqual({
      ok: true,
      values: {
        code: "DRESS_CODE",
        title_en: "Dress code",
        title_ms: "Kod pakaian",
        audience: { type: "all" },
        requires_signature: true,
      },
    });
  });
  it("the PDPA notice is always for everyone and always signed", () => {
    const r = parsePolicy(
      form({
        code: "PDPA_NOTICE",
        title_en: "Privacy notice",
        title_ms: "Notis privasi",
        audience_type: "branches",
      }),
    );
    expect(r.ok && r.values.audience).toEqual({ type: "all" });
    expect(r.ok && r.values.requires_signature).toBe(true);
  });
  it("needs both titles", () => {
    expect(
      parsePolicy(form({ code: "HANDBOOK", audience_type: "all" })),
    ).toEqual({
      ok: false,
      errors: { title_en: "required", title_ms: "required" },
    });
  });
});

describe("parseAnnouncement (POL-01)", () => {
  const now = "2026-11-03T02:00:00.000Z";
  it("publishes now unless a Malaysia-time schedule is given", () => {
    const base = { title_en: "Raya", title_ms: "Raya", audience_type: "all" };
    const immediate = parseAnnouncement(form(base), now);
    expect(immediate.ok && immediate.values.publish_at).toBe(now);
    const later = parseAnnouncement(
      form({ ...base, publish_at: "2026-11-10T09:00" }),
      now,
    );
    expect(later.ok && later.values.publish_at).toBe(
      "2026-11-10T01:00:00.000Z",
    );
  });
  it("rejects a bad date", () => {
    expect(
      parseAnnouncement(
        form({
          title_en: "A",
          title_ms: "A",
          audience_type: "all",
          publish_at: "soon",
        }),
        now,
      ),
    ).toEqual({ ok: false, errors: { publish_at: "invalidDate" } });
  });
});

describe("signing", () => {
  it("matches names whatever the spacing or capitals", () => {
    expect(
      sameName("  nurul  AINA binti ahmad ", "Nurul Aina binti Ahmad"),
    ).toBe(true);
    expect(sameName("Nurul Aina", "Nurul Aina binti Ahmad")).toBe(false);
  });
  it("has the consent wording in both languages", () => {
    expect(consentText("ms")).toMatch(/tandatangan elektronik/);
    expect(consentText("en")).toMatch(/electronic signature/);
  });
  it("is overdue after 7 days unsigned", () => {
    const published = "2026-11-01T00:00:00Z";
    expect(ackStatus(null, published, Date.parse("2026-11-05T00:00:00Z"))).toBe(
      "awaiting_signature",
    );
    expect(ackStatus(null, published, Date.parse("2026-11-09T00:00:01Z"))).toBe(
      "overdue",
    );
    expect(ackStatus("2026-11-02T00:00:00Z", published)).toBe("signed");
  });
});
