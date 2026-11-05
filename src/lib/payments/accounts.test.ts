import { describe, expect, it } from "vitest";
import {
  delimiterChoice,
  formatsFor,
  parseAccountDetails,
  parseCompanyAccount,
  parseMappingForm,
  type BankFileFormat,
} from "./accounts";

const FORMATS: BankFileFormat[] = [
  {
    code: "GENERIC_CSV",
    name: "Generic CSV",
    bank_code: null,
    column_mapping: null,
  },
  {
    code: "MBB_M2U_BIZ",
    name: "Maybank2u Biz",
    bank_code: "MBB",
    column_mapping: null,
  },
];
const BANKS = ["MBB", "CIMB"];

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [k, v] of Object.entries(values)) data.append(k, v);
  return data;
}

describe("formatsFor", () => {
  it("offers generic formats for any bank and a bank's own format only for that bank", () => {
    expect(formatsFor(FORMATS, "MBB").map((f) => f.code)).toEqual([
      "GENERIC_CSV",
      "MBB_M2U_BIZ",
    ]);
    expect(formatsFor(FORMATS, "CIMB").map((f) => f.code)).toEqual([
      "GENERIC_CSV",
    ]);
  });
});

describe("parseCompanyAccount", () => {
  const base = {
    bank_code: "CIMB",
    account_name: "Rakan Therapy Sdn Bhd",
    account_no: "8001-234 567",
    account_no_confirm: "8001234567",
    bank_file_format_code: "GENERIC_CSV",
  };

  it("accepts any bank, strips spaces and dashes, and reads the default box", () => {
    const r = parseCompanyAccount(
      form({ ...base, is_default: "on" }),
      BANKS,
      FORMATS,
    );
    expect(r.ok && r.values).toEqual({
      bank_code: "CIMB",
      account_name: "Rakan Therapy Sdn Bhd",
      account_no: "8001234567",
      corporate_id: null,
      org_code: null,
      bank_file_format_code: "GENERIC_CSV",
      is_default: true,
    });
  });

  it("needs the number typed twice the same", () => {
    const r = parseCompanyAccount(
      form({ ...base, account_no_confirm: "8001234568" }),
      BANKS,
      FORMATS,
    );
    expect(!r.ok && r.errors).toEqual({
      account_no_confirm: "accountNoMismatch",
    });
  });

  it("refuses a short number, an unknown bank and another bank's format", () => {
    const r = parseCompanyAccount(
      form({ ...base, bank_code: "XYZ", account_no: "123", account_name: "" }),
      BANKS,
      FORMATS,
    );
    expect(!r.ok && r.errors).toMatchObject({
      bank_code: "invalidChoice",
      account_no: "invalidAccountNo",
      account_name: "required",
    });
    const wrong = parseCompanyAccount(
      form({ ...base, bank_file_format_code: "MBB_M2U_BIZ" }),
      BANKS,
      FORMATS,
    );
    expect(!wrong.ok && wrong.errors).toEqual({
      bank_file_format_code: "formatMismatch",
    });
  });

  it("edits only the name, bank IDs and format of an existing account", () => {
    const r = parseAccountDetails(
      form({
        account_name: "Rakan",
        corporate_id: "CORP01",
        bank_file_format_code: "MBB_M2U_BIZ",
      }),
      "MBB",
      FORMATS,
    );
    expect(r.ok && r.values).toEqual({
      account_name: "Rakan",
      corporate_id: "CORP01",
      org_code: null,
      bank_file_format_code: "MBB_M2U_BIZ",
    });
  });
});

describe("parseMappingForm", () => {
  it("builds the mapping from ticked fields in their positions", () => {
    const r = parseMappingForm(
      form({
        delimiter: "tab",
        date_format: "DDMMYYYY",
        header: "on",
        include_amount: "on",
        header_amount: "Amt",
        order_amount: "2",
        include_account_no: "on",
        header_account_no: "Acc No",
        order_account_no: "1",
        header_email: "Email (not ticked)",
        transfer_same: "IT",
        transfer_inter: "IBG",
      }),
    );
    expect(r.ok && r.values).toEqual({
      delimiter: "\t",
      header: true,
      dateFormat: "DDMMYYYY",
      columns: [
        { field: "account_no", header: "Acc No" },
        { field: "amount", header: "Amt" },
      ],
      transferTypes: { sameBank: "IT", interbank: "IBG" },
    });
    expect(delimiterChoice("\t")).toBe("tab");
  });

  it("needs at least one column, a name for each, both transfer labels or neither", () => {
    const none = parseMappingForm(
      form({ delimiter: "comma", date_format: "YYYY-MM-DD" }),
    );
    expect(!none.ok && none.errors).toEqual({ columns: "required" });
    const r = parseMappingForm(
      form({
        delimiter: "comma",
        date_format: "YYYY-MM-DD",
        include_amount: "on",
        header_amount: "",
        order_amount: "0",
        transfer_same: "IT",
      }),
    );
    expect(!r.ok && r.errors).toEqual({
      header_amount: "required",
      order_amount: "invalidNumber",
      transfer_inter: "required",
    });
  });
});
