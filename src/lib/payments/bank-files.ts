// PAY-10 bank payment files for the app (Settings, payroll screens, unit tests). The code
// lives in supabase/functions/_shared/bank-files/ so the payroll Edge Function shares it.
export {
  ADAPTERS,
  generateBankFile,
} from "../../../supabase/functions/_shared/bank-files/adapters.ts";
export {
  DEFAULT_GENERIC_MAPPING,
  DELIMITERS,
  GENERIC_FIELDS,
  parseGenericMapping,
  type Delimiter,
  type GenericCsvMapping,
  type GenericField,
} from "../../../supabase/functions/_shared/bank-files/generic-csv.ts";
export {
  DATE_FORMATS,
  type DateFormat,
} from "../../../supabase/functions/_shared/bank-files/common.ts";
export {
  BankFileError,
  type BankFile,
  type BankFileProblem,
  type BankFileRun,
  type CompanyAccount,
  type PaymentLine,
} from "../../../supabase/functions/_shared/bank-files/types.ts";
