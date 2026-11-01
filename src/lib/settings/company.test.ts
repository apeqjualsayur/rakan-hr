import { describe, expect, it } from "vitest";
import { parseCompanyForm } from "./company";

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.set(k, v);
  return data;
};

describe("parseCompanyForm", () => {
  it("trims values and stores blanks as null (TBC stays empty)", () => {
    const result = parseCompanyForm(
      form({
        legal_name: "  Rakan Therapy Sdn Bhd ",
        ssm_no: "",
        state_code: "MY-14",
        is_msme: "yes",
        first_hire_date: "2026-12-01",
        lhdn_e_no: "E 1234567890",
      }),
    );
    expect(result).toEqual({
      ok: true,
      values: expect.objectContaining({
        legal_name: "Rakan Therapy Sdn Bhd",
        ssm_no: null,
        state_code: "MY-14",
        is_msme: true,
        first_hire_date: "2026-12-01",
        first_payday_date: null,
        lhdn_e_no: "E 1234567890",
        hrdcorp_no: null,
      }),
    });
  });

  it("reads the MSME answer", () => {
    const result = parseCompanyForm(form({ is_msme: "no" }));
    expect(result.ok && result.values.is_msme).toBe(false);
  });

  it("rejects an unknown state, a bad date and a payday before the first hire", () => {
    expect(parseCompanyForm(form({ state_code: "Selangor" }))).toEqual({
      ok: false,
      errors: { state_code: "invalidState" },
    });
    expect(parseCompanyForm(form({ first_hire_date: "2026-02-30" }))).toEqual({
      ok: false,
      errors: { first_hire_date: "invalidDate" },
    });
    expect(
      parseCompanyForm(
        form({
          first_hire_date: "2026-12-01",
          first_payday_date: "2026-11-28",
        }),
      ),
    ).toEqual({ ok: false, errors: { first_payday_date: "paydayBeforeHire" } });
  });

  it("limits field length", () => {
    expect(parseCompanyForm(form({ ssm_no: "1".repeat(41) }))).toEqual({
      ok: false,
      errors: { ssm_no: "tooLong" },
    });
  });
});
