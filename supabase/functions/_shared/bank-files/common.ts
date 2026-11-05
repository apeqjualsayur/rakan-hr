// Helpers every adapter uses: whole-sen money, the standard line checks, dates.
import type {
  BankFileProblem,
  BankFileRun,
  CompanyAccount,
  PaymentLine,
} from "./types.ts";

const MONEY = /^\d{1,10}(\.\d{1,2})?$/;
const ACCOUNT = /^\d{6,20}$/;

/** "1234.5" → 123450. Only for strings that passed MONEY. */
export function toSen(amount: string): number {
  const [whole, fraction = ""] = amount.split(".");
  return Number(whole) * 100 + Number((fraction + "00").slice(0, 2));
}

/** 123450 → "1234.50" (no thousands separators: banks reject them). */
export function fromSen(sen: number): string {
  return `${Math.floor(sen / 100)}.${String(sen % 100).padStart(2, "0")}`;
}

/** Digits only, as stored. */
export const digits = (value: string) => value.replace(/[\s-]/g, "");

/** True when the line is paid within the paying bank (no IBG / DuitNow hop). */
export const isSameBank = (account: CompanyAccount, line: PaymentLine) =>
  account.bankCode === line.bankCode;

/**
 * The checks every bank format needs: at least one line, positive amounts with at most
 * 2 decimals, 6–20 digit account numbers, a name, a bank, each employee paid once.
 */
export function checkLines(
  account: CompanyAccount,
  lines: readonly PaymentLine[],
  needs: { bic?: boolean } = {},
): BankFileProblem[] {
  const problems: BankFileProblem[] = [];
  if (!ACCOUNT.test(digits(account.accountNo ?? "")))
    problems.push({ code: "company_account", line: null });
  if (lines.length === 0) problems.push({ code: "no_lines", line: null });
  const seen = new Set<string>();
  lines.forEach((l, i) => {
    const at = { line: i + 1, employeeId: l.employeeId };
    if (!MONEY.test(l.amount ?? "") || toSen(l.amount) <= 0)
      problems.push({ code: "amount", ...at });
    if (!ACCOUNT.test(digits(l.accountNo ?? "")))
      problems.push({ code: "account_no", ...at });
    if (!clean(l.name)) problems.push({ code: "name", ...at });
    if (!l.bankCode || (needs.bic && !l.bankBic))
      problems.push({ code: "bank", ...at });
    if (seen.has(l.employeeId)) problems.push({ code: "duplicate", ...at });
    seen.add(l.employeeId);
  });
  return problems;
}

/** One line of text: no control characters or line breaks, single spaces. */
export function clean(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type DateFormat = "YYYY-MM-DD" | "DD/MM/YYYY" | "DDMMYYYY" | "YYYYMMDD";
export const DATE_FORMATS: readonly DateFormat[] = [
  "YYYY-MM-DD",
  "DD/MM/YYYY",
  "DDMMYYYY",
  "YYYYMMDD",
];

/** "2026-11-28" in the bank's date format. */
export function formatDate(iso: string, format: DateFormat): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  switch (format) {
    case "DD/MM/YYYY":
      return `${d}/${m}/${y}`;
    case "DDMMYYYY":
      return `${d}${m}${y}`;
    case "YYYYMMDD":
      return `${y}${m}${d}`;
    default:
      return `${y}-${m}-${d}`;
  }
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** "Salary Nov 2026", unless the run gives its own description. */
export function runDescription(run: BankFileRun): string {
  const custom = clean(run.description);
  if (custom) return custom;
  const [y, m] = run.periodMonth.split("-");
  return `Salary ${MONTHS[Number(m) - 1]} ${y}`;
}

/** "2026-11" from the payroll month. */
export const periodKey = (run: BankFileRun) => run.periodMonth.slice(0, 7);
