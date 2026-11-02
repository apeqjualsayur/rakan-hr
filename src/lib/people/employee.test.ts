import { describe, expect, it } from "vitest";
import {
  ageOn,
  defaultEisEligible,
  parsePersonal,
  parsePlacement,
  parseStatutory,
} from "./employee";

const TODAY = "2026-11-02";

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [k, v] of Object.entries(values)) data.set(k, v);
  return data;
}

describe("parsePersonal", () => {
  it("fills date of birth and gender from a new MyKad, over what was typed", () => {
    const result = parsePersonal(
      form({
        full_name: "Nurul Aina binti Ahmad",
        id_type: "mykad",
        id_no: "010203-14-5678",
        date_of_birth: "1990-01-01",
        gender: "male",
        nationality_kind: "my",
      }),
      TODAY,
    );
    expect(result).toEqual({
      ok: true,
      values: expect.objectContaining({
        id_no: "010203145678",
        date_of_birth: "2001-02-03",
        gender: "female",
        nationality: "MY",
        is_permanent_resident: false,
      }),
    });
  });

  it("keeps the stored IC when the field is left blank", () => {
    const result = parsePersonal(
      form({ full_name: "A", id_type: "mykad", id_no: "" }),
      TODAY,
    );
    expect(result.ok && "id_no" in result.values).toBe(false);
  });

  it("explains what is wrong with a MyKad", () => {
    const errors = (id_no: string) =>
      parsePersonal(form({ full_name: "A", id_type: "mykad", id_no }), TODAY);
    expect(errors("1234")).toEqual({
      ok: false,
      errors: { id_no: "invalidMykad" },
    });
    expect(errors("881332-10-5431")).toEqual({
      ok: false,
      errors: { id_no: "invalidMykadDate" },
    });
    expect(errors("880512-00-5431")).toEqual({
      ok: false,
      errors: { id_no: "invalidMykadPlace" },
    });
  });

  it("accepts and upper-cases passports, and needs a country for non-Malaysians", () => {
    const ok = parsePersonal(
      form({
        full_name: "Maria Santos",
        id_type: "passport",
        id_no: "p 1234567",
        nationality_kind: "other",
        nationality_other: "Philippines",
        is_pr: "on",
      }),
      TODAY,
    );
    expect(ok).toEqual({
      ok: true,
      values: expect.objectContaining({
        id_no: "P1234567",
        nationality: "Philippines",
        is_permanent_resident: true,
      }),
    });
    expect(
      parsePersonal(form({ full_name: "X", nationality_kind: "other" }), TODAY),
    ).toEqual({ ok: false, errors: { nationality_other: "required" } });
  });

  it("requires a name and checks contacts", () => {
    expect(
      parsePersonal(
        form({ full_name: " ", phone: "abc", work_email: "nope" }),
        TODAY,
      ),
    ).toEqual({
      ok: false,
      errors: {
        full_name: "required",
        phone: "invalidPhone",
        work_email: "invalidEmail",
      },
    });
  });

  it("stores only the emergency contact parts that were filled in", () => {
    const result = parsePersonal(
      form({
        full_name: "A",
        emergency_name: "Ahmad",
        emergency_phone: "+60 12-345 6789",
      }),
      TODAY,
    );
    expect(result.ok && result.values.emergency_contact).toEqual({
      name: "Ahmad",
      phone: "+60 12-345 6789",
    });
  });
});

describe("parsePlacement", () => {
  const role = "11111111-1111-4111-8111-111111111111";
  it("reads ids and status, blank = none", () => {
    expect(
      parsePlacement(
        form({ job_role_id: role, manager_id: "", status: "active" }),
      ),
    ).toEqual({
      ok: true,
      values: {
        job_role_id: role,
        job_title: null,
        branch_id: null,
        manager_id: null,
        status: "active",
      },
    });
  });
  it("refuses being your own manager", () => {
    expect(
      parsePlacement(form({ manager_id: role, status: "active" }), {}, role),
    ).toEqual({ ok: false, errors: { manager_id: "managerLoop" } });
  });
});

describe("parseStatutory", () => {
  it("keeps the PCB category and spouse-working flag in step", () => {
    const result = parseStatutory(
      form({
        pcb_category: "married_spouse_not_working",
        eis_eligible: "auto",
        children_count_eligible: "2",
        zakat_monthly: "50",
      }),
    );
    expect(result).toEqual({
      ok: true,
      values: expect.objectContaining({
        spouse_working: false,
        eis_eligible: null,
        children_count_eligible: 2,
        zakat_monthly: "50.00",
      }),
    });
  });
  it("rejects bad numbers", () => {
    expect(
      parseStatutory(
        form({ children_count_eligible: "-1", zakat_monthly: "1.234" }),
      ),
    ).toEqual({
      ok: false,
      errors: {
        children_count_eligible: "invalidNumber",
        zakat_monthly: "invalidMoney",
      },
    });
  });
});

describe("EIS default", () => {
  const malaysian = { nationality: "MY", is_permanent_resident: false };
  it("covers Malaysians aged 18 to 59", () => {
    expect(
      defaultEisEligible({ ...malaysian, date_of_birth: "2008-11-02" }, TODAY),
    ).toBe(true);
    expect(
      defaultEisEligible({ ...malaysian, date_of_birth: "2008-11-03" }, TODAY),
    ).toBe(false);
    expect(
      defaultEisEligible({ ...malaysian, date_of_birth: "1966-11-03" }, TODAY),
    ).toBe(true);
    expect(
      defaultEisEligible({ ...malaysian, date_of_birth: "1966-11-02" }, TODAY),
    ).toBe(false);
  });
  it("covers PRs, not foreign workers; unknown without a birth date", () => {
    expect(
      defaultEisEligible(
        {
          nationality: "Indonesia",
          is_permanent_resident: true,
          date_of_birth: "1990-01-01",
        },
        TODAY,
      ),
    ).toBe(true);
    expect(
      defaultEisEligible(
        {
          nationality: "Indonesia",
          is_permanent_resident: false,
          date_of_birth: "1990-01-01",
        },
        TODAY,
      ),
    ).toBe(false);
    expect(
      defaultEisEligible({ ...malaysian, date_of_birth: null }, TODAY),
    ).toBeNull();
  });
  it("counts age in whole years", () => {
    expect(ageOn("2000-02-29", "2026-02-28")).toBe(25);
    expect(ageOn("2000-02-29", "2026-03-01")).toBe(26);
  });
});
