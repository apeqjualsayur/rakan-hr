// GENERIC_CSV: the fallback that always works (PAY-10). A CSV in the DuitNow Bulk style
// whose columns, headers, delimiter and date format come from a column mapping, so it can
// be shaped to whatever a bank's "upload a CSV" screen asks for without new code.
import {
  checkLines,
  clean,
  DATE_FORMATS,
  type DateFormat,
  digits,
  formatDate,
  fromSen,
  isSameBank,
  periodKey,
  runDescription,
  toSen,
} from "./common.ts";
import {
  type BankFileAdapter,
  type BankFileProblem,
  BankFileError,
  type BankFileRun,
  type CompanyAccount,
  type PaymentLine,
} from "./types.ts";

/** Everything a column can hold. */
export const GENERIC_FIELDS = [
  "beneficiary_name",
  "id_no",
  "employee_no",
  "bank_bic",
  "bank_code",
  "bank_name",
  "account_no",
  "amount",
  "transfer_type",
  "reference",
  "description",
  "email",
  "payment_date",
] as const;
export type GenericField = (typeof GENERIC_FIELDS)[number];

export const DELIMITERS = [",", ";", "|", "\t"] as const;
export type Delimiter = (typeof DELIMITERS)[number];

export type GenericCsvMapping = {
  delimiter: Delimiter;
  /** Write a header row with each column's header text. */
  header: boolean;
  dateFormat: DateFormat;
  columns: { field: GenericField; header: string }[];
  /** What the transfer_type column says (defaults SAME_BANK / INTERBANK). */
  transferTypes?: { sameBank: string; interbank: string };
};

// Keep in step with the GENERIC_CSV row in supabase/migrations/20261110000100_bank_payments.sql.
export const DEFAULT_GENERIC_MAPPING: GenericCsvMapping = {
  delimiter: ",",
  header: true,
  dateFormat: "YYYY-MM-DD",
  columns: [
    { field: "beneficiary_name", header: "Beneficiary Name" },
    { field: "id_no", header: "Beneficiary ID" },
    { field: "bank_bic", header: "Bank Code" },
    { field: "bank_name", header: "Bank Name" },
    { field: "account_no", header: "Account Number" },
    { field: "amount", header: "Amount" },
    { field: "transfer_type", header: "Transfer Type" },
    { field: "reference", header: "Payment Reference" },
    { field: "description", header: "Payment Description" },
    { field: "email", header: "Beneficiary Email" },
  ],
};

const MAX_COLUMNS = GENERIC_FIELDS.length;
const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const shortText = (v: unknown, max: number) =>
  typeof v === "string" && clean(v) === v && v.length > 0 && v.length <= max;

/** Checks a stored or submitted mapping. Returns null when it is not usable. */
export function parseGenericMapping(value: unknown): GenericCsvMapping | null {
  if (!isObject(value)) return null;
  const { delimiter, header, dateFormat, columns, transferTypes } = value;
  if (!DELIMITERS.includes(delimiter as Delimiter)) return null;
  if (typeof header !== "boolean") return null;
  if (!DATE_FORMATS.includes(dateFormat as DateFormat)) return null;
  if (
    !Array.isArray(columns) ||
    columns.length === 0 ||
    columns.length > MAX_COLUMNS
  )
    return null;
  const fields = new Set<string>();
  for (const c of columns) {
    if (!isObject(c) || !GENERIC_FIELDS.includes(c.field as GenericField))
      return null;
    if (!shortText(c.header, 60) || fields.has(c.field as string)) return null;
    fields.add(c.field as string);
  }
  if (transferTypes !== undefined) {
    if (
      !isObject(transferTypes) ||
      !shortText(transferTypes.sameBank, 20) ||
      !shortText(transferTypes.interbank, 20)
    )
      return null;
  }
  return {
    delimiter: delimiter as Delimiter,
    header,
    dateFormat: dateFormat as DateFormat,
    columns: columns.map((c) => ({
      field: c.field as GenericField,
      header: c.header as string,
    })),
    ...(transferTypes
      ? { transferTypes: transferTypes as GenericCsvMapping["transferTypes"] }
      : {}),
  };
}

/** RFC 4180 quoting: only when the value holds the delimiter, a quote or a line break. */
function cell(value: string, delimiter: Delimiter): string {
  return value.includes(delimiter) || /["\r\n]/.test(value)
    ? `"${value.replaceAll('"', '""')}"`
    : value;
}

function value(
  field: GenericField,
  run: BankFileRun,
  account: CompanyAccount,
  line: PaymentLine,
  mapping: GenericCsvMapping,
): string {
  switch (field) {
    case "beneficiary_name":
      return clean(line.name);
    case "id_no":
      return digits(clean(line.idNo));
    case "employee_no":
      return clean(line.employeeNo);
    case "bank_bic":
      return clean(line.bankBic);
    case "bank_code":
      return clean(line.bankCode);
    case "bank_name":
      return clean(line.bankName);
    case "account_no":
      return digits(line.accountNo);
    case "amount":
      return fromSen(toSen(line.amount));
    case "transfer_type": {
      const t = mapping.transferTypes ?? {
        sameBank: "SAME_BANK",
        interbank: "INTERBANK",
      };
      return isSameBank(account, line) ? t.sameBank : t.interbank;
    }
    case "reference":
      return clean(line.employeeNo);
    case "description":
      return runDescription(run);
    case "email":
      return clean(line.email);
    case "payment_date":
      return formatDate(run.payDate, mapping.dateFormat);
  }
}

export const genericCsv: BankFileAdapter = {
  key: "generic_csv",
  generate(run, account, lines) {
    const mapping = parseGenericMapping(account.columnMapping);
    const problems: BankFileProblem[] = mapping
      ? []
      : [{ code: "mapping", line: null }];
    const needsBic =
      mapping?.columns.some((c) => c.field === "bank_bic") ?? false;
    problems.push(...checkLines(account, lines, { bic: needsBic }));
    if (problems.length || !mapping) throw new BankFileError(problems);

    const rows: string[][] = [];
    if (mapping.header) rows.push(mapping.columns.map((c) => c.header));
    for (const line of lines)
      rows.push(
        mapping.columns.map((c) => value(c.field, run, account, line, mapping)),
      );
    const total = lines.reduce((sum, l) => sum + toSen(l.amount), 0);
    return {
      // CRLF and a final line break: what bank upload screens built for Excel expect.
      content:
        rows
          .map((r) =>
            r.map((v) => cell(v, mapping.delimiter)).join(mapping.delimiter),
          )
          .join("\r\n") + "\r\n",
      fileName: `salary_${periodKey(run)}_${account.bankCode}_${account.formatCode}.csv`,
      mimeType: "text/csv",
      lineCount: lines.length,
      total: fromSen(total),
    };
  },
};
