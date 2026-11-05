// Step 11 form parsers and limit arithmetic. Pure, so they are unit-tested; submit_claim()
// enforces the same rules in the database.
import { readCheckbox, readMoney } from "@/lib/people/fields";
import {
  done,
  isUuid,
  readDate,
  readText,
  type FieldErrors,
  type Parsed,
} from "@/lib/settings/form";

/** Cents as an integer, so limits are compared without floating-point drift. */
export function cents(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return 0;
  const [whole = "0", fraction = ""] = String(value).split(".");
  return (
    Number(whole) * 100 +
    Number((fraction + "00").slice(0, 2)) *
      (String(value).startsWith("-") ? -1 : 1)
  );
}

export const fromCents = (c: number) => (c / 100).toFixed(2);

/** What is left of a monthly limit (null = no limit). */
export function leftThisMonth(limit: string | null, claimed: string | number) {
  if (limit === null) return null;
  return fromCents(Math.max(cents(limit) - cents(claimed), 0));
}

/** Mileage: km × rate, rounded to the sen (as submit_claim does). */
export function mileageAmount(km: string | number, rate: string | null) {
  const d = Number(km);
  if (!rate || !(d > 0)) return null;
  return (Math.round(d * Number(rate) * 100) / 100).toFixed(2);
}

export type ClaimValues = {
  claim_type_id: string;
  expense_date: string;
  amount: string | null;
  distance_km: number | null;
  trip_from: string | null;
  trip_to: string | null;
  description: string;
};

/** CLM-01 claim form. Mileage claims give a distance; the amount is worked out from it. */
export function parseClaim(
  formData: FormData,
  mileage: boolean,
  today: string,
): Parsed<ClaimValues> {
  const errors: FieldErrors = {};
  const type = String(formData.get("claim_type_id") ?? "");
  if (!isUuid(type)) errors.claim_type_id = "required";
  const date = readDate(formData, "expense_date", errors);
  if (!date && !errors.expense_date) errors.expense_date = "required";
  else if (date && date > today) errors.expense_date = "futureDate";
  let amount: string | null = null;
  let km: number | null = null;
  if (mileage) {
    const raw = String(formData.get("distance_km") ?? "").trim();
    km = Number(raw);
    if (raw === "") errors.distance_km = "required";
    else if (!/^\d{1,5}(\.\d)?$/.test(raw) || !(km > 0))
      errors.distance_km = "invalidNumber";
  } else {
    amount = readMoney(formData, "amount", errors);
    if (!amount && !errors.amount) errors.amount = "required";
    else if (amount && cents(amount) <= 0) errors.amount = "invalidMoney";
  }
  const description = readText(formData, "description", 500, errors);
  if (!description) errors.description = "required";
  return done(
    {
      claim_type_id: type,
      expense_date: date ?? "",
      amount,
      distance_km: mileage ? km : null,
      trip_from: mileage ? readText(formData, "trip_from", 120, errors) : null,
      trip_to: mileage ? readText(formData, "trip_to", 120, errors) : null,
      description: description ?? "",
    },
    errors,
  );
}

export type ClaimTypeValues = {
  name_en: string;
  name_ms: string;
  monthly_limit: string | null;
  per_claim_limit: string | null;
  is_taxable: boolean;
  requires_receipt: boolean;
  eligible_role_ids: string[];
};

/** Settings > Claims: one claim type. */
export function parseClaimType(formData: FormData): Parsed<ClaimTypeValues> {
  const errors: FieldErrors = {};
  const name_en = readText(formData, "name_en", 80, errors);
  const name_ms = readText(formData, "name_ms", 80, errors);
  if (!name_en) errors.name_en = "required";
  if (!name_ms) errors.name_ms = "required";
  const monthly = readMoney(formData, "monthly_limit", errors);
  const perClaim = readMoney(formData, "per_claim_limit", errors);
  if (monthly && cents(monthly) <= 0) errors.monthly_limit = "invalidMoney";
  if (perClaim && cents(perClaim) <= 0) errors.per_claim_limit = "invalidMoney";
  if (monthly && perClaim && cents(perClaim) > cents(monthly))
    errors.per_claim_limit = "perClaimOverMonthly";
  const roles = formData.getAll("eligible_role_ids").map(String).filter(isUuid);
  return done(
    {
      name_en: name_en ?? "",
      name_ms: name_ms ?? "",
      monthly_limit: monthly,
      per_claim_limit: perClaim,
      is_taxable: readCheckbox(formData, "is_taxable"),
      requires_receipt: readCheckbox(formData, "requires_receipt"),
      eligible_role_ids: roles,
    },
    errors,
  );
}
