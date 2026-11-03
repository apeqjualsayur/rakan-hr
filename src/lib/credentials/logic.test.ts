import { describe, expect, it } from "vitest";
import {
  buildMatrix,
  daysBetween,
  needsAction,
  parseCpd,
  parseCredential,
  rowAction,
  sortRows,
  suggestExpiry,
  summarise,
} from "./logic";
import type { CredentialStatusRow, DisplayStatus } from "./types";

function row(
  over: Partial<CredentialStatusRow> & { display_status: DisplayStatus },
): CredentialStatusRow {
  return {
    employee_id: "e1",
    credential_type_id: `t-${over.type_code ?? "BLS"}`,
    requirement: "mandatory",
    blocks_roster: false,
    type_code: "BLS",
    name_en: "BLS / CPR",
    name_ms: "BLS / CPR",
    category: "clinical_cert",
    restricted: false,
    has_expiry: true,
    tracks_cpd: false,
    sort_order: 50,
    verified_id: null,
    effective_date: null,
    expiry_date: null,
    verified_at: null,
    pending_id: null,
    submitted_at: null,
    rejected_id: null,
    reject_reason: null,
    validity: null,
    days_left: null,
    ...over,
  };
}

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [k, v] of Object.entries(values)) data.set(k, v);
  return data;
}

describe("row actions (ui-system.md §4 credential row)", () => {
  it("renew now when expired, renew when expiring, linked to the record it renews", () => {
    expect(
      rowAction(row({ display_status: "expired", verified_id: "v1" })),
    ).toEqual({
      action: "renewNow",
      target: "new?type=t-BLS&renew=v1",
    });
    expect(
      rowAction(row({ display_status: "expiring_soon", verified_id: "v1" }))
        .action,
    ).toBe("renew");
  });
  it("view a pending or valid one, add a missing one, resubmit a rejected one", () => {
    expect(
      rowAction(row({ display_status: "pending", pending_id: "p1" })),
    ).toEqual({
      action: "view",
      target: "p1",
    });
    expect(
      rowAction(row({ display_status: "valid", verified_id: "v1" })),
    ).toEqual({
      action: "view",
      target: "v1",
    });
    expect(rowAction(row({ display_status: "missing" }))).toEqual({
      action: "add",
      target: "new?type=t-BLS",
    });
    expect(rowAction(row({ display_status: "rejected" })).action).toBe(
      "resubmit",
    );
  });
  it("action needed = expired, expiring, rejected, or a missing mandatory one", () => {
    expect(needsAction(row({ display_status: "missing" }))).toBe(true);
    expect(
      needsAction(row({ display_status: "missing", requirement: "optional" })),
    ).toBe(false);
    expect(needsAction(row({ display_status: "pending" }))).toBe(false);
  });
});

describe("summarise (CRD-13 ring)", () => {
  it("counts valid and expiring-soon mandatory ones and picks the most urgent", () => {
    const s = summarise([
      row({ type_code: "A", display_status: "valid", validity: "valid" }),
      row({
        type_code: "B",
        display_status: "expiring_soon",
        validity: "expiring_soon",
        days_left: 10,
      }),
      row({
        type_code: "C",
        display_status: "expired",
        validity: "expired",
        days_left: -3,
      }),
      row({ type_code: "D", display_status: "missing" }),
      row({
        type_code: "E",
        display_status: "missing",
        requirement: "optional",
      }),
    ]);
    expect(s).toMatchObject({
      mandatoryTotal: 4,
      mandatoryValid: 2,
      percent: 50,
    });
    expect(s.focus?.kind).toBe("expired");
    expect(s.focus?.row.type_code).toBe("C");
  });
  it("a pending renewal of a still-valid credential keeps counting", () => {
    expect(
      summarise([row({ display_status: "pending", validity: "expiring_soon" })])
        .mandatoryValid,
    ).toBe(1);
  });
  it("is 100% with nothing mandatory", () => {
    expect(summarise([]).percent).toBe(100);
  });
  it("sorts the most urgent first", () => {
    const sorted = sortRows([
      row({ type_code: "V", display_status: "valid" }),
      row({ type_code: "X", display_status: "expired" }),
      row({ type_code: "M", display_status: "missing" }),
    ]);
    expect(sorted.map((r) => r.type_code)).toEqual(["X", "M", "V"]);
  });
});

describe("dates", () => {
  it("suggests an expiry the day before the anniversary", () => {
    expect(suggestExpiry("2026-01-01", 12)).toBe("2026-12-31");
    expect(suggestExpiry("2024-02-29", 12)).toBe("2025-02-28");
    expect(suggestExpiry("2026-01-01", null)).toBe("");
  });
  it("counts days between dates", () => {
    expect(daysBetween("2026-11-03", "2026-12-31")).toBe(58);
    expect(daysBetween("2026-11-03", "2026-11-01")).toBe(-2);
  });
});

describe("parseCredential (CRD-05, CRD-06)", () => {
  const types = [
    { id: "bls", has_expiry: true, tracks_cpd: false },
    { id: "mahpc", has_expiry: false, tracks_cpd: false },
    { id: "apc", has_expiry: true, tracks_cpd: true },
  ];
  it("needs an expiry after the effective date when the type expires", () => {
    expect(
      parseCredential(
        form({ credential_type_id: "bls", effective_date: "2026-01-01" }),
        types,
      ),
    ).toEqual({ ok: false, errors: { expiry_date: "required" } });
    expect(
      parseCredential(
        form({
          credential_type_id: "bls",
          effective_date: "2026-01-01",
          expiry_date: "2026-01-01",
        }),
        types,
      ),
    ).toEqual({ ok: false, errors: { expiry_date: "expiryBeforeEffective" } });
  });
  it("drops the expiry for types that never expire, and CPD points unless tracked", () => {
    const r = parseCredential(
      form({
        credential_type_id: "mahpc",
        effective_date: "2020-01-01",
        expiry_date: "2030-01-01",
        cpd_points: "5",
      }),
      types,
    );
    expect(r.ok && r.values.expiry_date).toBeNull();
    expect(r.ok && r.values.cpd_points).toBeNull();
    const apc = parseCredential(
      form({
        credential_type_id: "apc",
        effective_date: "2027-01-01",
        expiry_date: "2027-12-31",
        cpd_points: "12.5",
      }),
      types,
    );
    expect(apc).toEqual({
      ok: true,
      values: expect.objectContaining({
        cpd_points: "12.5",
        effective_date: "2027-01-01",
      }),
    });
  });
  it("refuses a type that is not offered", () => {
    expect(
      parseCredential(
        form({ credential_type_id: "x", effective_date: "2026-01-01" }),
        types,
      ),
    ).toEqual({ ok: false, errors: { credential_type_id: "invalidChoice" } });
  });
});

describe("parseCpd (CRD-18)", () => {
  it("needs a title, a past date and points", () => {
    expect(
      parseCpd(
        form({ credential_type_id: "apc", activity_date: "2026-12-01" }),
        ["apc"],
        "2026-11-03",
      ),
    ).toEqual({
      ok: false,
      errors: {
        title: "required",
        activity_date: "invalidDate",
        points: "required",
      },
    });
    expect(
      parseCpd(
        form({
          credential_type_id: "apc",
          title: "AAC workshop",
          activity_date: "2026-10-01",
          points: "6",
          category: "workshop",
        }),
        ["apc"],
        "2026-11-03",
      ),
    ).toEqual({
      ok: true,
      values: {
        credential_type_id: "apc",
        title: "AAC workshop",
        provider: null,
        activity_date: "2026-10-01",
        points: "6",
        hours: null,
        category: "workshop",
      },
    });
  });
});

describe("buildMatrix (CRD-15)", () => {
  it("has a column per required type and empty cells where a role does not need it", () => {
    const m = buildMatrix([
      row({
        employee_id: "a",
        type_code: "BLS",
        credential_type_id: "bls",
        sort_order: 50,
        display_status: "valid",
      }),
      row({
        employee_id: "a",
        type_code: "MAHPC",
        credential_type_id: "mahpc",
        sort_order: 10,
        display_status: "missing",
      }),
      row({
        employee_id: "b",
        type_code: "BLS",
        credential_type_id: "bls",
        sort_order: 50,
        display_status: "expired",
      }),
      row({
        employee_id: "b",
        type_code: "X",
        credential_type_id: "x",
        requirement: null,
        display_status: "valid",
      }),
    ]);
    expect(m.columns.map((c) => c.code)).toEqual(["MAHPC", "BLS"]);
    expect(m.cell("a", "mahpc")?.display_status).toBe("missing");
    expect(m.cell("b", "mahpc")).toBeNull();
  });
});
