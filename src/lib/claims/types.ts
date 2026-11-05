// Step 11 row shapes (data-model.md §3.7). Money arrives as strings (numeric).

export type ClaimType = {
  id: string;
  name_en: string;
  name_ms: string;
  monthly_limit: string | null;
  per_claim_limit: string | null;
  is_taxable: boolean;
  is_mileage: boolean;
  requires_receipt: boolean;
  eligible_role_ids: string[];
  is_active: boolean;
  sort_order: number;
};

export const CLAIM_TYPE_COLUMNS =
  "id, name_en, name_ms, monthly_limit, per_claim_limit, is_taxable, is_mileage, requires_receipt, eligible_role_ids, is_active, sort_order";

/** my_claim_types(): the types open to the signed-in employee, with this month's use. */
export type MyClaimType = Pick<
  ClaimType,
  | "id"
  | "name_en"
  | "name_ms"
  | "monthly_limit"
  | "per_claim_limit"
  | "is_taxable"
  | "is_mileage"
  | "requires_receipt"
> & { claimed: string; mileage_rate: string | null };

export type ClaimStatus = "pending" | "approved" | "rejected" | "cancelled";

export type Claim = {
  id: string;
  employee_id: string;
  claim_type_id: string;
  expense_date: string;
  amount: string;
  description: string;
  distance_km: string | null;
  rate_per_km: string | null;
  trip_from: string | null;
  trip_to: string | null;
  status: ClaimStatus;
  approval_id: string | null;
  payroll_run_id: string | null;
  decision_comment: string | null;
  created_at: string;
};

export const CLAIM_COLUMNS =
  "id, employee_id, claim_type_id, expense_date, amount, description, distance_km, rate_per_km, trip_from, trip_to, status, approval_id, payroll_run_id, decision_comment, created_at";
