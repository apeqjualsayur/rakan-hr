// ORG-01 / ORG-02: company profile and employer numbers (tenants row).
import { isStateCode } from "@/lib/malaysia";
import {
  done,
  readDate,
  readText,
  type FieldErrors,
  type Parsed,
} from "./form";

export type CompanyValues = {
  legal_name: string | null;
  trading_name: string | null;
  ssm_no: string | null;
  address: string | null;
  state_code: string | null;
  is_msme: boolean;
  first_hire_date: string | null;
  first_payday_date: string | null;
  epf_employer_no: string | null;
  socso_employer_code: string | null;
  lhdn_e_no: string | null;
  hrdcorp_no: string | null;
};

export const COMPANY_COLUMNS =
  "legal_name, trading_name, ssm_no, address, state_code, is_msme, first_hire_date, first_payday_date, epf_employer_no, socso_employer_code, lhdn_e_no, hrdcorp_no";

// Number formats differ between agencies and change over time, so only length is checked;
// a wrong number is easier to fix than a valid one the form refuses.
const NUMBER_MAX = 40;

export function parseCompanyForm(formData: FormData): Parsed<CompanyValues> {
  const errors: FieldErrors = {};
  const text = (name: string, max: number) =>
    readText(formData, name, max, errors);

  const legal_name = text("legal_name", 200);
  const state = String(formData.get("state_code") ?? "");
  if (state !== "" && !isStateCode(state)) errors.state_code = "invalidState";

  const first_hire_date = readDate(formData, "first_hire_date", errors);
  const first_payday_date = readDate(formData, "first_payday_date", errors);
  if (
    first_hire_date &&
    first_payday_date &&
    first_payday_date < first_hire_date
  )
    errors.first_payday_date = "paydayBeforeHire";

  return done(
    {
      legal_name,
      trading_name: text("trading_name", 200),
      ssm_no: text("ssm_no", NUMBER_MAX),
      address: text("address", 500),
      state_code: state === "" ? null : state,
      is_msme: formData.get("is_msme") !== "no",
      first_hire_date,
      first_payday_date,
      epf_employer_no: text("epf_employer_no", NUMBER_MAX),
      socso_employer_code: text("socso_employer_code", NUMBER_MAX),
      lhdn_e_no: text("lhdn_e_no", NUMBER_MAX),
      hrdcorp_no: text("hrdcorp_no", NUMBER_MAX),
    },
    errors,
  );
}
