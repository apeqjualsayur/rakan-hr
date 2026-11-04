import type { EmploymentRecord, PayModel } from "@/lib/people/records";

// Step 8 row shapes (data-model.md §3.4). Money columns arrive as strings (numeric).

export const CANDIDATE_STAGES = [
  "applied",
  "interview",
  "offer",
  "hired",
  "rejected",
] as const;
export type CandidateStage = (typeof CANDIDATE_STAGES)[number];

export const OPENING_STATUSES = ["open", "on_hold", "closed"] as const;
export type OpeningStatus = (typeof OPENING_STATUSES)[number];

export type JobOpening = {
  id: string;
  job_role_id: string | null;
  title: string;
  employment_type: EmploymentRecord["employment_type"];
  pay_model: PayModel;
  salary_min: string | null;
  salary_max: string | null;
  branch_id: string | null;
  status: OpeningStatus;
  notes: string | null;
  created_at: string;
};

export const OPENING_COLUMNS =
  "id, job_role_id, title, employment_type, pay_model, salary_min, salary_max, branch_id, status, notes, created_at";

export type Candidate = {
  id: string;
  job_opening_id: string;
  full_name: string;
  email: string;
  phone: string | null;
  cv_path: string | null;
  stage: CandidateStage;
  stage_changed_at: string;
  notes: string | null;
  rejected_reason: string | null;
  offer_sent_at: string | null;
  offer_accepted_at: string | null;
  preboarding_token_expires_at: string | null;
  preboarding_token_used_at: string | null;
  preboarding_session_expires_at: string | null;
  preboarding_submitted_at: string | null;
  employee_id: string | null;
  converted_at: string | null;
  created_at: string;
};

export const CANDIDATE_COLUMNS =
  "id, job_opening_id, full_name, email, phone, cv_path, stage, stage_changed_at, notes, rejected_reason, offer_sent_at, offer_accepted_at, preboarding_token_expires_at, preboarding_token_used_at, preboarding_session_expires_at, preboarding_submitted_at, employee_id, converted_at, created_at";

export type OfferStatus = "draft" | "sent" | "accepted" | "withdrawn";

export type Offer = {
  id: string;
  candidate_id: string;
  status: OfferStatus;
  locale: "en" | "ms";
  job_title: string;
  job_role_id: string | null;
  branch_id: string | null;
  manager_id: string | null;
  employment_type: EmploymentRecord["employment_type"];
  pay_model: PayModel;
  basic_salary: string | null;
  hourly_rate: string | null;
  session_rate: string | null;
  normal_hours_per_day: string;
  work_days_per_week: string;
  start_date: string;
  contract_end_date: string | null;
  probation_months: number;
  extra_terms: string | null;
  pdf_path: string | null;
  document_sha256: string | null;
  sent_at: string | null;
  expires_at: string | null;
  accepted_at: string | null;
  signature_id: string | null;
  created_at: string;
};

export const OFFER_COLUMNS =
  "id, candidate_id, status, locale, job_title, job_role_id, branch_id, manager_id, employment_type, pay_model, basic_salary, hourly_rate, session_rate, normal_hours_per_day, work_days_per_week, start_date, contract_end_date, probation_months, extra_terms, pdf_path, document_sha256, sent_at, expires_at, accepted_at, signature_id, created_at";

export type LetterTemplate = {
  id: string;
  kind: "offer" | "contract" | "confirmation" | "extension";
  locale: "en" | "ms";
  title: string;
  body: string;
  is_draft: boolean;
  updated_at: string;
};

export const TEMPLATE_COLUMNS =
  "id, kind, locale, title, body, is_draft, updated_at";

/** Default tasks (convert_candidate); their titles are translated by code. */
export const ONBOARDING_CODES = [
  "SYSTEM_ACCOUNTS",
  "ORIENTATION",
  "UNIFORM",
  "CREDENTIALS_VERIFIED",
  "POLICIES_SIGNED",
  "PAYROLL_DETAILS",
  "EPF_REGISTRATION",
  "SOCSO_REGISTRATION",
] as const;

export type OnboardingTask = {
  id: string;
  code: string | null;
  title: string;
  owner_role: string;
  due_date: string | null;
  done_at: string | null;
  sort_order: number;
};

export const TASK_COLUMNS =
  "id, code, title, owner_role, due_date, done_at, sort_order";

export const PROBATION_CRITERIA = [
  "quality",
  "skills",
  "reliability",
  "teamwork",
  "conduct",
] as const;
export type ProbationCriterion = (typeof PROBATION_CRITERIA)[number];

export const RECOMMENDATIONS = ["confirm", "extend", "end"] as const;
export type Recommendation = (typeof RECOMMENDATIONS)[number];

export type ProbationReviewStatus =
  "submitted" | "approved" | "rejected" | "cancelled";

export type ProbationReview = {
  id: string;
  employee_id: string;
  reviewer_id: string | null;
  due_date: string;
  ratings: Record<ProbationCriterion, number>;
  comments: string;
  recommendation: Recommendation;
  extend_months: number | null;
  status: ProbationReviewStatus;
  approval_id: string | null;
  decided_at: string | null;
  confirmed_on: string | null;
  new_probation_end: string | null;
  letter_path: string | null;
  letter_error: string | null;
  created_at: string;
};

export const REVIEW_COLUMNS =
  "id, employee_id, reviewer_id, due_date, ratings, comments, recommendation, extend_months, status, approval_id, decided_at, confirmed_on, new_probation_end, letter_path, letter_error, created_at";

/** What preboarding_context() returns to the portal. */
export type PreboardingContext = {
  candidate: {
    id: string;
    full_name: string;
    email: string;
    submitted_at: string | null;
  };
  company: { name: string | null; legal_name: string | null };
  offer: {
    id: string;
    status: "sent" | "accepted";
    locale: "en" | "ms";
    job_title: string;
    start_date: string;
    expires_at: string | null;
    accepted_at: string | null;
    signature_id: string | null;
    document_sha256: string | null;
  } | null;
  employee: {
    id: string;
    full_name: string;
    id_type: "mykad" | "passport";
    id_no_last4: string | null;
    nationality: string;
    is_permanent_resident: boolean;
    date_of_birth: string | null;
    gender: "male" | "female" | null;
    marital_status: "single" | "married" | "divorced" | "widowed" | null;
    religion: string | null;
    email: string | null;
    phone: string | null;
    address: string | null;
    emergency_contact: { name?: string; relationship?: string; phone?: string };
    epf_no: string | null;
    socso_no: string | null;
    tax_no: string | null;
    pcb_category: string | null;
    children_count_eligible: number;
  } | null;
  bank: {
    bank_code: string;
    account_no_last4: string;
    holder_name: string;
  } | null;
  dependents: {
    id: string;
    name: string;
    relationship: "spouse" | "child";
    date_of_birth: string | null;
    is_disabled: boolean;
    in_tertiary_education: boolean;
  }[];
  required: {
    credential_type_id: string;
    requirement: "mandatory" | "optional";
  }[];
  types: import("@/lib/credentials/types").CredentialType[];
  credentials: (import("@/lib/credentials/types").StaffCredential & {
    file_count: number;
  })[];
  banks: { code: string; name: string }[];
};
