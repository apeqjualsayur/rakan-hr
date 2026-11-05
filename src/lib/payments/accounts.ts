// Settings > Company bank accounts (PAY-10): row shapes and pure form parsers. The database
// (company_bank_accounts_before_write) enforces the same rules.
import { readCheckbox, readChoice } from "@/lib/people/fields";
import {
  done,
  readText,
  type FieldErrors,
  type Parsed,
} from "@/lib/settings/form";
import {
  DATE_FORMATS,
  GENERIC_FIELDS,
  parseGenericMapping,
  type DateFormat,
  type Delimiter,
  type GenericCsvMapping,
} from "./bank-files";

export type CompanyBankAccount = {
  id: string;
  bank_code: string;
  account_name: string;
  account_no_last4: string;
  corporate_id: string | null;
  org_code: string | null;
  bank_file_format_code: string;
  column_mapping: unknown;
  is_default: boolean;
  active_from: string;
  retired_at: string | null;
};

export const COMPANY_BANK_ACCOUNT_COLUMNS =
  "id, bank_code, account_name, account_no_last4, corporate_id, org_code, bank_file_format_code, column_mapping, is_default, active_from, retired_at";

export type BankFileFormat = {
  code: string;
  name: string;
  bank_code: string | null;
  column_mapping: unknown;
};

export const BANK_FILE_FORMAT_COLUMNS = "code, name, bank_code, column_mapping";

/** Formats an account at this bank may use: the bank's own, plus every generic one. */
export const formatsFor = (
  formats: readonly BankFileFormat[],
  bankCode: string,
) => formats.filter((f) => f.bank_code === null || f.bank_code === bankCode);

export type CompanyAccountDetails = {
  account_name: string;
  corporate_id: string | null;
  org_code: string | null;
  bank_file_format_code: string;
};

export type NewCompanyAccount = CompanyAccountDetails & {
  bank_code: string;
  account_no: string;
  is_default: boolean;
};

function readDetails(
  formData: FormData,
  formats: readonly BankFileFormat[],
  bankCode: string | null,
  errors: FieldErrors,
): CompanyAccountDetails {
  const account_name = readText(formData, "account_name", 120, errors);
  if (!account_name) errors.account_name = "required";
  const corporate_id = readText(formData, "corporate_id", 40, errors);
  const org_code = readText(formData, "org_code", 40, errors);
  const format = String(formData.get("bank_file_format_code") ?? "");
  const allowed = bankCode ? formatsFor(formats, bankCode) : [];
  if (bankCode && !allowed.some((f) => f.code === format))
    errors.bank_file_format_code = "formatMismatch";
  return {
    account_name: account_name ?? "",
    corporate_id,
    org_code,
    bank_file_format_code: format,
  };
}

/** A new account: any bank, its number typed twice (it can never be changed afterwards). */
export function parseCompanyAccount(
  formData: FormData,
  bankCodes: readonly string[],
  formats: readonly BankFileFormat[],
): Parsed<NewCompanyAccount> {
  const errors: FieldErrors = {};
  const bank_code = readChoice(formData, "bank_code", bankCodes, errors, {
    required: true,
  });
  const number = (name: string) =>
    String(formData.get(name) ?? "").replace(/[\s-]/g, "");
  const account_no = number("account_no");
  if (account_no === "") errors.account_no = "required";
  else if (!/^\d{6,20}$/.test(account_no))
    errors.account_no = "invalidAccountNo";
  else if (number("account_no_confirm") !== account_no)
    errors.account_no_confirm = "accountNoMismatch";
  const details = readDetails(formData, formats, bank_code, errors);
  return done(
    {
      ...details,
      bank_code: bank_code ?? "",
      account_no,
      is_default: readCheckbox(formData, "is_default"),
    },
    errors,
  );
}

/** Name, bank IDs and file format of an existing account (bank and number stay fixed). */
export function parseAccountDetails(
  formData: FormData,
  bankCode: string,
  formats: readonly BankFileFormat[],
): Parsed<CompanyAccountDetails> {
  const errors: FieldErrors = {};
  const details = readDetails(formData, formats, bankCode, errors);
  return done(details, errors);
}

/** Form value ↔ delimiter character (a tab cannot sit in a <select> value nicely). */
export const DELIMITER_CHOICES: Record<string, Delimiter> = {
  comma: ",",
  semicolon: ";",
  pipe: "|",
  tab: "\t",
};

export const delimiterChoice = (d: Delimiter) =>
  Object.entries(DELIMITER_CHOICES).find(([, v]) => v === d)?.[0] ?? "comma";

/**
 * The file-columns editor: per field an include box, header text and position; plus the
 * delimiter, header row, date format and transfer-type labels. Returns the mapping to save.
 */
export function parseMappingForm(
  formData: FormData,
): Parsed<GenericCsvMapping> {
  const errors: FieldErrors = {};
  const delimiter = DELIMITER_CHOICES[String(formData.get("delimiter"))];
  if (!delimiter) errors.delimiter = "invalidChoice";
  const dateFormat = String(formData.get("date_format")) as DateFormat;
  if (!DATE_FORMATS.includes(dateFormat)) errors.date_format = "invalidChoice";
  const columns: {
    field: (typeof GENERIC_FIELDS)[number];
    header: string;
    at: number;
  }[] = [];
  GENERIC_FIELDS.forEach((field, index) => {
    if (!readCheckbox(formData, `include_${field}`)) return;
    const header = readText(formData, `header_${field}`, 60, errors);
    if (!header) errors[`header_${field}`] = "required";
    const raw = String(formData.get(`order_${field}`) ?? "").trim();
    const at = raw === "" ? index + 1 : Number(raw);
    if (!Number.isInteger(at) || at < 1 || at > 99)
      errors[`order_${field}`] = "invalidNumber";
    columns.push({ field, header: header ?? "", at: at * 100 + index });
  });
  if (columns.length === 0) errors.columns = "required";
  const same = readText(formData, "transfer_same", 20, errors);
  const inter = readText(formData, "transfer_inter", 20, errors);
  if (Boolean(same) !== Boolean(inter))
    errors[same ? "transfer_inter" : "transfer_same"] = "required";
  const mapping: GenericCsvMapping = {
    delimiter: delimiter ?? ",",
    header: readCheckbox(formData, "header"),
    dateFormat,
    columns: columns
      .sort((a, b) => a.at - b.at)
      .map(({ field, header }) => ({ field, header })),
    ...(same && inter
      ? { transferTypes: { sameBank: same, interbank: inter } }
      : {}),
  };
  if (Object.keys(errors).length === 0 && !parseGenericMapping(mapping))
    errors.columns = "invalidMapping";
  return done(mapping, errors);
}
