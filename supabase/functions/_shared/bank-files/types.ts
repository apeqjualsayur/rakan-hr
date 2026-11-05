// PAY-10 bank payment files: the shapes every adapter shares. Pure TypeScript, no imports,
// so the payroll Edge Function (Deno), the app and the unit tests use one copy.

/** The payroll run being paid. Dates are ISO ("2026-11-01"). */
export type BankFileRun = {
  id: string;
  /** First day of the payroll month. */
  periodMonth: string;
  /** The day the money should reach staff. */
  payDate: string;
  /** Overrides the default payment description ("Salary Nov 2026"). */
  description?: string | null;
};

/** The company account paying the run, with its full number (decrypted on the server). */
export type CompanyAccount = {
  id: string;
  bankCode: string;
  bankName: string;
  bankBic: string | null;
  accountName: string;
  accountNo: string;
  /** Bank-assigned IDs some file headers need (corporate ID, organisation code). */
  corporateId: string | null;
  orgCode: string | null;
  /** bank_file_formats.code, e.g. "GENERIC_CSV". */
  formatCode: string;
  /** bank_file_formats.adapter_key: picks the adapter. */
  adapterKey: string;
  /** The account's own column mapping, else the format's (generic CSV only). */
  columnMapping: unknown;
};

/** One person to pay. Amount is the net pay as a string with up to 2 decimals. */
export type PaymentLine = {
  employeeId: string;
  employeeNo: string;
  name: string;
  idNo: string | null;
  email: string | null;
  bankCode: string;
  bankName: string;
  bankBic: string | null;
  accountNo: string;
  amount: string;
};

export type BankFile = {
  fileName: string;
  mimeType: string;
  content: string;
  lineCount: number;
  /** Sum of all lines, "1234.50". */
  total: string;
};

export type BankFileProblemCode =
  | "no_lines"
  | "amount"
  | "account_no"
  | "name"
  | "bank"
  | "duplicate"
  | "company_account"
  | "mapping"
  | "unknown_adapter";

/** line: 1-based index into `lines`, or null for a problem with the run or account. */
export type BankFileProblem = {
  code: BankFileProblemCode;
  line: number | null;
  employeeId?: string;
};

/** Thrown with every problem found, so payroll can list them all at once. */
export class BankFileError extends Error {
  constructor(public readonly problems: BankFileProblem[]) {
    super(
      `Bank file not generated: ${problems.map((p) => (p.line ? `line ${p.line} ${p.code}` : p.code)).join(", ")}`,
    );
    this.name = "BankFileError";
  }
}

/** One bank file format. Adapters are pure: same input, same file, byte for byte. */
export type BankFileAdapter = {
  key: string;
  generate(
    run: BankFileRun,
    account: CompanyAccount,
    lines: readonly PaymentLine[],
  ): BankFile;
};
