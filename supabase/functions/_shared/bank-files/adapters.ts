// PAY-10: the one entry point payroll calls. It picks the adapter named by the paying
// account's bank_file_formats.adapter_key; payroll logic never knows which bank it is.
// To add a bank, see README.md in this folder.
import { genericCsv } from "./generic-csv.ts";
import {
  type BankFile,
  type BankFileAdapter,
  BankFileError,
  type BankFileRun,
  type CompanyAccount,
  type PaymentLine,
} from "./types.ts";

/** adapter_key → adapter. One entry per bank file format. */
export const ADAPTERS: Readonly<Record<string, BankFileAdapter>> = {
  [genericCsv.key]: genericCsv,
};

/** Writes the bank payment file for a run, or throws BankFileError listing every problem. */
export function generateBankFile(
  run: BankFileRun,
  companyAccount: CompanyAccount,
  lines: readonly PaymentLine[],
): BankFile {
  const adapter = ADAPTERS[companyAccount.adapterKey];
  if (!adapter)
    throw new BankFileError([{ code: "unknown_adapter", line: null }]);
  return adapter.generate(run, companyAccount, lines);
}
