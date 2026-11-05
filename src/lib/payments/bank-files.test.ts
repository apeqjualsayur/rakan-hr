import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  BankFileError,
  DEFAULT_GENERIC_MAPPING,
  generateBankFile,
  parseGenericMapping,
  type BankFileProblem,
  type CompanyAccount,
  type PaymentLine,
} from "./bank-files";

const run = { id: "run-1", periodMonth: "2026-11-01", payDate: "2026-11-28" };
const account: CompanyAccount = {
  id: "acc-1",
  bankCode: "MBB",
  bankName: "Maybank",
  bankBic: "MBBEMYKL",
  accountName: "Rakan Therapy Sdn Bhd",
  accountNo: "512345678901",
  corporateId: null,
  orgCode: null,
  formatCode: "GENERIC_CSV",
  adapterKey: "generic_csv",
  columnMapping: DEFAULT_GENERIC_MAPPING,
};
const aina: PaymentLine = {
  employeeId: "e1",
  employeeNo: "E0001",
  name: "Nurul Aina binti Ahmad",
  idNo: "900101-14-5678",
  email: "aina@example.test",
  bankCode: "MBB",
  bankName: "Maybank",
  bankBic: "MBBEMYKL",
  accountNo: "1122 3344 5566",
  amount: "3245.5",
};
const daniel: PaymentLine = {
  employeeId: "e2",
  employeeNo: "E0002",
  name: 'Daniel "Dan" Lim, Wei Jie',
  idNo: null,
  email: null,
  bankCode: "CIMB",
  bankName: "CIMB Bank",
  bankBic: "CIBBMYKL",
  accountNo: "8001234567",
  amount: "3100.05",
};

const problems = (fn: () => unknown): BankFileProblem[] => {
  try {
    fn();
  } catch (e) {
    if (e instanceof BankFileError) return e.problems;
    throw e;
  }
  throw new Error("expected a BankFileError");
};

describe("generateBankFile: GENERIC_CSV", () => {
  it("writes the default DuitNow Bulk-style file, byte for byte", () => {
    const file = generateBankFile(run, account, [aina, daniel]);
    expect(file.content).toBe(
      [
        "Beneficiary Name,Beneficiary ID,Bank Code,Bank Name,Account Number,Amount,Transfer Type,Payment Reference,Payment Description,Beneficiary Email",
        "Nurul Aina binti Ahmad,900101145678,MBBEMYKL,Maybank,112233445566,3245.50,SAME_BANK,E0001,Salary Nov 2026,aina@example.test",
        '"Daniel ""Dan"" Lim, Wei Jie",,CIBBMYKL,CIMB Bank,8001234567,3100.05,INTERBANK,E0002,Salary Nov 2026,',
        "",
      ].join("\r\n"),
    );
    expect(file).toMatchObject({
      fileName: "salary_2026-11_MBB_GENERIC_CSV.csv",
      mimeType: "text/csv",
      lineCount: 2,
      total: "6345.55",
    });
  });

  it("adds sen exactly (no floating-point drift)", () => {
    const lines = Array.from({ length: 10 }, (_, i) => ({
      ...aina,
      employeeId: `e${i}`,
      amount: "0.10",
    }));
    expect(generateBankFile(run, account, lines).total).toBe("1.00");
  });

  it("follows a custom column mapping: order, headers, delimiter, date, transfer labels", () => {
    const file = generateBankFile(
      run,
      {
        ...account,
        columnMapping: {
          delimiter: ";",
          header: false,
          dateFormat: "DD/MM/YYYY",
          columns: [
            { field: "payment_date", header: "Date" },
            { field: "account_no", header: "Acc" },
            { field: "amount", header: "Amt" },
            { field: "transfer_type", header: "Mode" },
            { field: "employee_no", header: "Staff" },
          ],
          transferTypes: { sameBank: "IT", interbank: "IBG" },
        },
      },
      [aina, daniel],
    );
    expect(file.content).toBe(
      "28/11/2026;112233445566;3245.50;IT;E0001\r\n28/11/2026;8001234567;3100.05;IBG;E0002\r\n",
    );
  });

  it("uses the run's own description when it has one, on one line", () => {
    const file = generateBankFile(
      { ...run, description: "Bonus\nDec 2026" },
      account,
      [aina],
    );
    expect(file.content).toContain(",Bonus Dec 2026,");
  });

  it("lists every problem at once instead of writing a bad file", () => {
    expect(
      problems(() =>
        generateBankFile(run, account, [
          { ...aina, amount: "0" },
          { ...daniel, accountNo: "12-34", name: "  " },
          { ...daniel, bankBic: null },
          { ...aina, amount: "12.345" },
        ]),
      ),
    ).toEqual([
      { code: "amount", line: 1, employeeId: "e1" },
      { code: "account_no", line: 2, employeeId: "e2" },
      { code: "name", line: 2, employeeId: "e2" },
      { code: "bank", line: 3, employeeId: "e2" },
      { code: "duplicate", line: 3, employeeId: "e2" },
      { code: "amount", line: 4, employeeId: "e1" },
      { code: "duplicate", line: 4, employeeId: "e1" },
    ]);
  });

  it("refuses an empty run, a bad company account, a bad mapping and an unknown adapter", () => {
    expect(problems(() => generateBankFile(run, account, []))).toEqual([
      { code: "no_lines", line: null },
    ]);
    expect(
      problems(() =>
        generateBankFile(run, { ...account, accountNo: "" }, [aina]),
      ),
    ).toEqual([{ code: "company_account", line: null }]);
    expect(
      problems(() =>
        generateBankFile(run, { ...account, columnMapping: { columns: [] } }, [
          aina,
        ]),
      ),
    ).toContainEqual({
      code: "mapping",
      line: null,
    });
    expect(
      problems(() =>
        generateBankFile(run, { ...account, adapterKey: "nope" }, [aina]),
      ),
    ).toEqual([{ code: "unknown_adapter", line: null }]);
  });
});

describe("parseGenericMapping", () => {
  it("accepts the default and refuses unknown fields, repeats, bad delimiters and empty headers", () => {
    expect(parseGenericMapping(DEFAULT_GENERIC_MAPPING)).toEqual(
      DEFAULT_GENERIC_MAPPING,
    );
    const base = { delimiter: ",", header: true, dateFormat: "YYYY-MM-DD" };
    expect(
      parseGenericMapping({
        ...base,
        columns: [{ field: "salary", header: "X" }],
      }),
    ).toBeNull();
    expect(
      parseGenericMapping({
        ...base,
        columns: [
          { field: "amount", header: "A" },
          { field: "amount", header: "B" },
        ],
      }),
    ).toBeNull();
    expect(
      parseGenericMapping({
        ...base,
        delimiter: "#",
        columns: [{ field: "amount", header: "A" }],
      }),
    ).toBeNull();
    expect(
      parseGenericMapping({
        ...base,
        columns: [{ field: "amount", header: "" }],
      }),
    ).toBeNull();
    expect(parseGenericMapping(null)).toBeNull();
  });

  it("matches the GENERIC_CSV row seeded in the database", () => {
    const sql = readFileSync(
      "supabase/migrations/20261110000100_bank_payments.sql",
      "utf8",
    );
    const seeded = JSON.parse(/'(\{[\s\S]*?\})'::jsonb/.exec(sql)![1]!);
    expect(seeded).toEqual(DEFAULT_GENERIC_MAPPING);
  });
});
