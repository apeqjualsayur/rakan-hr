import { describe, expect, it } from "vitest";
import { describeChangeValue, parseChangeRequest } from "./changes";
import {
  buildOrgTree,
  countReports,
  matchesPerson,
  searchTerm,
} from "./directory";
import { filterPeople, NO_FILTERS, type ListPerson } from "./list";
import {
  documentPath,
  parseBankAccount,
  parseContract,
  parseDependent,
} from "./records";

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [k, v] of Object.entries(values)) data.set(k, v);
  return data;
}

describe("parseContract", () => {
  it("keeps only the rate for the pay model, as exact money strings", () => {
    const result = parseContract(
      form({
        employment_type: "full_time",
        pay_model: "monthly",
        basic_salary: "3,500",
        hourly_rate: "25",
        normal_hours_per_day: "8",
        work_days_per_week: "5.5",
        start_date: "2026-12-01",
        probation_end: "2027-02-28",
      }),
    );
    expect(result).toEqual({
      ok: true,
      values: expect.objectContaining({
        basic_salary: "3500.00",
        hourly_rate: null,
        session_rate: null,
        work_days_per_week: "5.5",
      }),
    });
  });

  it("needs the rate for the pay model and dates after the start", () => {
    expect(
      parseContract(
        form({
          employment_type: "locum_contractor",
          pay_model: "per_session",
          start_date: "2026-12-01",
          probation_end: "2026-11-01",
        }),
      ),
    ).toEqual({
      ok: false,
      errors: { session_rate: "rateRequired", probation_end: "beforeStart" },
    });
    expect(
      parseContract(
        form({ employment_type: "full_time", pay_model: "monthly" }),
      ),
    ).toEqual({
      ok: false,
      errors: { basic_salary: "rateRequired", start_date: "required" },
    });
  });
});

describe("parseBankAccount", () => {
  it("strips separators, checks the bank and upper-cases the holder", () => {
    expect(
      parseBankAccount(
        form({
          bank_code: "MBB",
          account_no: "1140-2233 4821",
          holder_name: "Aina binti Ali",
        }),
        ["MBB", "CIMB"],
      ),
    ).toEqual({
      ok: true,
      values: {
        bank_code: "MBB",
        account_no: "114022334821",
        holder_name: "AINA BINTI ALI",
      },
    });
    expect(
      parseBankAccount(form({ bank_code: "XYZ", account_no: "12ab" }), ["MBB"]),
    ).toEqual({
      ok: false,
      errors: {
        bank_code: "invalidChoice",
        account_no: "invalidAccountNo",
        holder_name: "required",
      },
    });
  });
});

describe("parseDependent", () => {
  it("reads PCB child relief flags", () => {
    expect(
      parseDependent(
        form({
          name: "Adam",
          relationship: "child",
          date_of_birth: "2015-04-01",
          is_disabled: "on",
        }),
        "2026-11-02",
      ),
    ).toEqual({
      ok: true,
      values: {
        name: "Adam",
        relationship: "child",
        date_of_birth: "2015-04-01",
        is_disabled: true,
        in_tertiary_education: false,
      },
    });
  });
});

describe("documentPath", () => {
  it("files documents by tenant, employee and type with a safe name", () => {
    expect(
      documentPath(
        "t",
        "e",
        "contract",
        "Kontrak Kerja (signed).PDF",
        1700000000000,
      ),
    ).toBe("t/e/contract/1700000000000-Kontrak-Kerja-signed.pdf");
  });
});

describe("parseChangeRequest", () => {
  it("reads a bank change", () => {
    expect(
      parseChangeRequest(
        form({
          field: "bank_account",
          bank_code: "PBB",
          account_no: "4455667712",
          holder_name: "aina",
          note: "New account",
        }),
        ["PBB"],
      ),
    ).toEqual({
      ok: true,
      values: {
        field: "bank_account",
        value: {
          bank_code: "PBB",
          account_no: "4455667712",
          holder_name: "AINA",
        },
        note: "New account",
      },
    });
  });
  it("needs a value, and only allows the listed details", () => {
    expect(parseChangeRequest(form({ field: "phone", value: "" }), [])).toEqual(
      {
        ok: false,
        errors: { value: "required" },
      },
    );
    expect(
      parseChangeRequest(form({ field: "full_name", value: "X" }), []),
    ).toEqual({
      ok: false,
      errors: { field: "invalidChoice" },
    });
  });
});

describe("directory", () => {
  const p = (
    id: string,
    full_name: string,
    manager_id: string | null = null,
  ) => ({
    id,
    full_name,
    manager_id,
  });

  it("builds the reporting tree from manager_id, siblings by name", () => {
    const tree = buildOrgTree([
      p("lead", "Zara Lead"),
      p("ot", "Ben OT", "lead"),
      p("slt", "Aina SLT", "lead"),
      p("intern", "Chin Intern", "slt"),
      p("admin", "Ali Admin"),
    ]);
    expect(tree.map((n) => n.person.id)).toEqual(["admin", "lead"]);
    expect(tree[1]!.reports.map((n) => n.person.id)).toEqual(["slt", "ot"]);
    expect(tree[1]!.reports[0]!.reports.map((n) => n.person.id)).toEqual([
      "intern",
    ]);
    expect(countReports(tree[1]!)).toBe(3);
  });

  it("treats people whose manager is not listed as roots, and never loses anyone in a loop", () => {
    const tree = buildOrgTree([
      p("a", "A", "gone"),
      p("b", "B", "c"),
      p("c", "C", "b"),
    ]);
    const ids = (nodes: typeof tree): string[] =>
      nodes.flatMap((n) => [n.person.id, ...ids(n.reports)]);
    expect(ids(tree).sort()).toEqual(["a", "b", "c"]);
  });

  it("searches name, title and role without caring about case or accents", () => {
    const person = {
      full_name: "Chloé Tan",
      job_title: null,
      job_role_name: "Occupational Therapist",
    };
    expect(matchesPerson(person, "chloe")).toBe(true);
    expect(matchesPerson(person, "THERAPIST")).toBe(true);
    expect(matchesPerson(person, "nurse")).toBe(false);
  });

  it("cleans search text for the database filter", () => {
    expect(searchTerm("a")).toBeNull();
    expect(searchTerm(" tan, (OT)* ")).toBe("tan OT");
    expect(searchTerm("100%_")).toBe("100");
  });
});

describe("filterPeople", () => {
  const person = (over: Partial<ListPerson>): ListPerson => ({
    employee_no: "E0001",
    full_name: "Aina",
    status: "active",
    branch_id: "b1",
    job_role_id: "r1",
    job_title: null,
    employment_type: "full_time",
    ...over,
  });
  const people = [
    person({}),
    person({
      employee_no: "E0002",
      full_name: "Ben",
      branch_id: null,
      job_role_id: "r2",
      employment_type: "part_time",
    }),
    person({
      employee_no: "E0003",
      full_name: "Cara",
      job_title: "Front Desk",
      status: "left",
    }),
  ];
  const names = (list: ListPerson[]) => list.map((p) => p.full_name);

  it("filters by branch (or none), role, type and search", () => {
    expect(
      names(filterPeople(people, { ...NO_FILTERS, branch: "none" })),
    ).toEqual(["Ben"]);
    expect(names(filterPeople(people, { ...NO_FILTERS, role: "r1" }))).toEqual([
      "Aina",
      "Cara",
    ]);
    expect(
      names(filterPeople(people, { ...NO_FILTERS, type: "part_time" })),
    ).toEqual(["Ben"]);
    expect(
      names(filterPeople(people, { ...NO_FILTERS, query: "e0003" })),
    ).toEqual(["Cara"]);
    expect(
      names(filterPeople(people, { ...NO_FILTERS, query: "front" })),
    ).toEqual(["Cara"]);
    expect(
      names(
        filterPeople(people, { ...NO_FILTERS, query: "therapist" }, (id) =>
          id === "r2" ? "Therapist" : null,
        ),
      ),
    ).toEqual(["Ben"]);
  });
});

describe("describeChangeValue", () => {
  const bank = (code: string) => (code === "MBB" ? "Maybank" : code);
  it("formats each kind of value on one line", () => {
    expect(
      describeChangeValue(
        "bank_account",
        { bank_code: "MBB", account_last4: "4821", holder_name: "AINA" },
        bank,
      ),
    ).toBe("Maybank ••4821 · AINA");
    expect(
      describeChangeValue(
        "emergency_contact",
        { name: "Ahmad", relationship: "Father", phone: "012" },
        bank,
      ),
    ).toBe("Ahmad (Father) · 012");
    expect(describeChangeValue("phone", { value: "013-7654321" }, bank)).toBe(
      "013-7654321",
    );
    expect(describeChangeValue("address", { value: null }, bank)).toBeNull();
    expect(describeChangeValue("email", null, bank)).toBeNull();
  });
});
