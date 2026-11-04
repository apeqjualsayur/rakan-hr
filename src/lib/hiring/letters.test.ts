import { describe, expect, it } from "vitest";
import {
  fillTemplate,
  letterDate,
  MERGE_FIELDS,
  offerValues,
  parseBlocks,
  probationEnd,
  ringgit,
  sampleValues,
  unknownFields,
} from "./letters";

describe("letter templates (HIR-03)", () => {
  it("fills merge fields and drops lines left empty", () => {
    const text = fillTemplate(
      "Dear {{ name }},\n\n{{extra_terms}}\n\nStart: {{start_date}}",
      { name: "Aina", extra_terms: "", start_date: "1 December 2026" },
    );
    expect(text).toBe("Dear Aina,\n\n\nStart: 1 December 2026");
    expect(parseBlocks(text)).toEqual([
      { type: "paragraph", text: "Dear Aina," },
      { type: "paragraph", text: "Start: 1 December 2026" },
    ]);
  });

  it("reads titles, headings, bullets and multi-line paragraphs", () => {
    expect(
      parseBlocks(
        "# Offer\n\n## Key terms\n- Pay: RM 1\n- Hours\n\nLine one\nLine two",
      ),
    ).toEqual([
      { type: "title", text: "Offer" },
      { type: "heading", text: "Key terms" },
      { type: "bullet", text: "Pay: RM 1" },
      { type: "bullet", text: "Hours" },
      { type: "paragraph", text: "Line one\nLine two" },
    ]);
  });

  it("flags merge fields a letter does not know", () => {
    expect(unknownFields("{{name}} {{pay}} {{payy}}", "offer")).toEqual([
      "payy",
    ]);
    expect(unknownFields("{{pay}}", "confirmation")).toEqual(["pay"]);
    expect(MERGE_FIELDS.extension).toContain("new_probation_end");
  });

  it("formats dates and ringgit without Intl or floats", () => {
    expect(letterDate("2026-03-04", "en")).toBe("4 March 2026");
    expect(letterDate("2026-03-04", "ms")).toBe("4 Mac 2026");
    expect(letterDate("2026-08-15", "ms")).toBe("15 Ogos 2026");
    expect(ringgit("4500")).toBe("RM 4,500.00");
    expect(ringgit("1234567.5")).toBe("RM 1,234,567.50");
    expect(ringgit(null)).toBe("");
  });

  it("ends probation the day before the same date N months later", () => {
    expect(probationEnd("2026-12-01", 3)).toBe("2027-02-28");
    expect(probationEnd("2026-11-30", 3)).toBe("2027-02-27"); // Feb has no 30th
    expect(probationEnd("2027-01-31", 1)).toBe("2027-02-27");
    expect(probationEnd("2026-12-01", 0)).toBeNull();
  });

  it("builds offer values per pay model and language", () => {
    const base = {
      job_title: "Occupational Therapist",
      employment_type: "contract",
      pay_model: "hourly",
      basic_salary: null,
      hourly_rate: "45.5",
      session_rate: null,
      normal_hours_per_day: "8.00",
      work_days_per_week: "5.5",
      start_date: "2026-12-01",
      contract_end_date: "2027-11-30",
      probation_months: 3,
      extra_terms: "  Transport allowance RM 200.  ",
    };
    const extra = {
      name: "Aina",
      company: {
        name: "Pusat Terapi",
        legal_name: null,
        reg_no: null,
        address: null,
      },
      branch_name: null,
      manager_name: null,
      today: "2026-11-04",
    };
    const en = offerValues(base, extra, "en");
    expect(en.pay).toBe("RM 45.50 an hour");
    expect(en.normal_hours_per_day).toBe("8");
    expect(en.employment_type).toBe("fixed-term contract");
    expect(en.contract_end).toContain("30 November 2027");
    expect(en.probation_end).toBe("28 February 2027");
    expect(en.offer_expiry_date).toBe("18 November 2026");
    expect(en.branch_name).toBe("Pusat Terapi");
    expect(en.company_reg_no).toBe("[company registration no.]");
    expect(en.extra_terms).toBe("Transport allowance RM 200.");
    const ms = offerValues(
      { ...base, pay_model: "monthly", basic_salary: "3000" },
      extra,
      "ms",
    );
    expect(ms.pay).toBe("RM 3,000.00 sebulan (gaji pokok)");
    expect(ms.manager_name).toBe("pengurus anda");
  });

  it("has an example value for every merge field (template preview)", () => {
    const values = sampleValues({ name: "Rakan Demo" }, "2026-11-04", "en");
    for (const kind of Object.keys(
      MERGE_FIELDS,
    ) as (keyof typeof MERGE_FIELDS)[]) {
      for (const field of MERGE_FIELDS[kind]) {
        if (field === "extra_terms" || field === "contract_end") continue;
        expect(values[field], field).toBeTruthy();
      }
    }
  });
});
