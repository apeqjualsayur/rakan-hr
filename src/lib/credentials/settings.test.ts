import { describe, expect, it } from "vitest";
import { customCode, parseCredentialType, parseOffsets } from "./settings";

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [k, v] of Object.entries(values)) data.set(k, v);
  return data;
}

describe("credential type settings", () => {
  it("reads reminder offsets, largest first, without repeats", () => {
    expect(parseOffsets("30, 90 7,90")).toEqual([90, 30, 7]);
    expect(parseOffsets("0, 30")).toBeNull();
    expect(parseOffsets("")).toBeNull();
  });

  it("keeps CPD targets only for types that track CPD, validity only when it expires", () => {
    const parsed = parseCredentialType(
      form({
        name_en: "Hanen certification",
        name_ms: "Pensijilan Hanen",
        default_validity_months: "24",
        cpd_points_required: "30",
        reminder_offsets_days: "60, 30",
        is_active: "on",
      }),
    );
    expect(parsed).toEqual({
      ok: true,
      values: expect.objectContaining({
        has_expiry: false,
        default_validity_months: null,
        tracks_cpd: false,
        cpd_points_required: null,
        reminder_offsets_days: [60, 30],
        is_active: true,
      }),
    });
  });

  it("needs both names", () => {
    expect(parseCredentialType(form({ name_en: "X" }))).toEqual({
      ok: false,
      errors: { name_ms: "required" },
    });
  });

  it("makes a unique code for a company's own type", () => {
    expect(customCode("Hanen certification", [])).toBe(
      "CUSTOM_HANEN_CERTIFICATION",
    );
    expect(
      customCode("Hanen certification", ["CUSTOM_HANEN_CERTIFICATION"]),
    ).toBe("CUSTOM_HANEN_CERTIFICATION_2");
    expect(customCode("!!!", [])).toBe("CUSTOM_TYPE");
  });
});
