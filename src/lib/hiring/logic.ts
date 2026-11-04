// Step 8 form parsers and status rules. Pure, so they are unit-tested; the database
// enforces the same rules (check constraints, triggers, functions).
import {
  readCheckbox,
  readChoice,
  readDecimal,
  readEmail,
  readInteger,
  readMoney,
  readPhone,
} from "@/lib/people/fields";
import {
  EMPLOYMENT_TYPES,
  PAY_MODELS,
  RATE_FIELD,
  type EmploymentRecord,
} from "@/lib/people/records";
import {
  done,
  isUuid,
  readDate,
  readText,
  type FieldErrors,
  type Parsed,
} from "@/lib/settings/form";
import { unknownFields, type LetterKind } from "./letters";
import {
  CANDIDATE_STAGES,
  OPENING_STATUSES,
  PROBATION_CRITERIA,
  RECOMMENDATIONS,
  type CandidateStage,
  type Offer,
  type PreboardingContext,
  type ProbationCriterion,
  type ProbationReview,
  type Recommendation,
} from "./types";

function readUuid(formData: FormData, name: string, errors: FieldErrors) {
  const value = String(formData.get(name) ?? "");
  if (value === "") return null;
  if (!isUuid(value)) {
    errors[name] = "invalidChoice";
    return null;
  }
  return value;
}

// ── HIR-01 openings ──

export type OpeningValues = {
  title: string;
  job_role_id: string | null;
  employment_type: (typeof EMPLOYMENT_TYPES)[number];
  pay_model: (typeof PAY_MODELS)[number];
  salary_min: string | null;
  salary_max: string | null;
  branch_id: string | null;
  status: (typeof OPENING_STATUSES)[number];
  notes: string | null;
};

export function parseOpening(formData: FormData): Parsed<OpeningValues> {
  const errors: FieldErrors = {};
  const title = readText(formData, "title", 120, errors);
  if (!title) errors.title = "required";
  const salary_min = readMoney(formData, "salary_min", errors);
  const salary_max = readMoney(formData, "salary_max", errors);
  if (salary_min && salary_max && Number(salary_max) < Number(salary_min))
    errors.salary_max = "rangeOrder";
  return done(
    {
      title: title ?? "",
      job_role_id: readUuid(formData, "job_role_id", errors),
      employment_type:
        readChoice(formData, "employment_type", EMPLOYMENT_TYPES, errors, {
          required: true,
        }) ?? "full_time",
      pay_model:
        readChoice(formData, "pay_model", PAY_MODELS, errors, {
          required: true,
        }) ?? "monthly",
      salary_min,
      salary_max,
      branch_id: readUuid(formData, "branch_id", errors),
      status:
        readChoice(formData, "status", OPENING_STATUSES, errors, {
          required: true,
        }) ?? "open",
      notes: readText(formData, "notes", 2000, errors),
    },
    errors,
  );
}

// ── HIR-02 candidates ──

export type CandidateValues = {
  job_opening_id: string;
  full_name: string;
  email: string;
  phone: string | null;
  notes: string | null;
};

export function parseCandidate(formData: FormData): Parsed<CandidateValues> {
  const errors: FieldErrors = {};
  const job_opening_id = readUuid(formData, "job_opening_id", errors);
  if (!job_opening_id && !errors.job_opening_id)
    errors.job_opening_id = "required";
  const full_name = readText(formData, "full_name", 200, errors);
  if (!full_name) errors.full_name = "required";
  const email = readEmail(formData, "email", errors);
  if (!email && !errors.email) errors.email = "required";
  return done(
    {
      job_opening_id: job_opening_id ?? "",
      full_name: full_name ?? "",
      email: email ?? "",
      phone: readPhone(formData, "phone", errors),
      notes: readText(formData, "notes", 4000, errors),
    },
    errors,
  );
}

/** Stages HR can move a candidate to by hand (Hired comes from Convert to employee). */
export function stageMoves(
  stage: CandidateStage,
  accepted: boolean,
): CandidateStage[] {
  if (stage === "hired") return [];
  if (accepted) return stage === "rejected" ? [] : ["rejected"];
  return CANDIDATE_STAGES.filter((s) => s !== stage && s !== "hired");
}

// ── HIR-03 offers ──

export type OfferValues = Pick<
  Offer,
  | "locale"
  | "job_title"
  | "job_role_id"
  | "branch_id"
  | "manager_id"
  | "employment_type"
  | "pay_model"
  | "basic_salary"
  | "hourly_rate"
  | "session_rate"
  | "normal_hours_per_day"
  | "work_days_per_week"
  | "start_date"
  | "contract_end_date"
  | "probation_months"
  | "extra_terms"
>;

export function parseOffer(formData: FormData): Parsed<OfferValues> {
  const errors: FieldErrors = {};
  const job_title = readText(formData, "job_title", 120, errors);
  if (!job_title) errors.job_title = "required";
  const employment_type =
    readChoice(formData, "employment_type", EMPLOYMENT_TYPES, errors, {
      required: true,
    }) ?? "full_time";
  const pay_model =
    readChoice(formData, "pay_model", PAY_MODELS, errors, {
      required: true,
    }) ?? "monthly";
  const rates = {
    basic_salary: readMoney(formData, "basic_salary", errors),
    hourly_rate: readMoney(formData, "hourly_rate", errors),
    session_rate: readMoney(formData, "session_rate", errors),
  };
  const rateField = RATE_FIELD[pay_model] as keyof typeof rates;
  if (rates[rateField] === null && !errors[rateField])
    errors[rateField] = "rateRequired";

  const normal_hours_per_day = readDecimal(
    formData,
    "normal_hours_per_day",
    errors,
    { min: 0.5, max: 24 },
  );
  if (!normal_hours_per_day && !errors.normal_hours_per_day)
    errors.normal_hours_per_day = "required";
  const work_days_per_week = readDecimal(
    formData,
    "work_days_per_week",
    errors,
    {
      min: 0.5,
      max: 7,
      places: 1,
    },
  );
  if (!work_days_per_week && !errors.work_days_per_week)
    errors.work_days_per_week = "required";

  const start_date = readDate(formData, "start_date", errors);
  if (!start_date && !errors.start_date) errors.start_date = "required";
  const contract_end_date = readDate(formData, "contract_end_date", errors);
  if (start_date && contract_end_date && contract_end_date <= start_date)
    errors.contract_end_date = "beforeStart";
  const probation_months = readInteger(formData, "probation_months", errors, {
    min: 0,
    max: 12,
  });
  if (probation_months === null && !errors.probation_months)
    errors.probation_months = "required";

  return done(
    {
      locale: formData.get("letter_locale") === "ms" ? "ms" : "en",
      job_title: job_title ?? "",
      job_role_id: readUuid(formData, "job_role_id", errors),
      branch_id: readUuid(formData, "branch_id", errors),
      manager_id: readUuid(formData, "manager_id", errors),
      employment_type,
      pay_model,
      basic_salary: rateField === "basic_salary" ? rates.basic_salary : null,
      hourly_rate: rateField === "hourly_rate" ? rates.hourly_rate : null,
      session_rate: rateField === "session_rate" ? rates.session_rate : null,
      normal_hours_per_day: normal_hours_per_day ?? "",
      work_days_per_week: work_days_per_week ?? "",
      start_date: start_date ?? "",
      contract_end_date,
      probation_months: probation_months ?? 0,
      extra_terms: readText(formData, "extra_terms", 4000, errors),
    },
    errors,
  );
}

export type OfferState =
  "draft" | "sent" | "expired" | "accepted" | "withdrawn";

/** A sent offer past its date shows as expired (the candidate can no longer accept). */
export function offerState(
  offer: Pick<Offer, "status" | "expires_at">,
  now: Date,
): OfferState {
  if (
    offer.status === "sent" &&
    offer.expires_at &&
    new Date(offer.expires_at) <= now
  )
    return "expired";
  return offer.status;
}

/** Offer terms prefilled from the opening (new offer) or the last offer (a revised one). */
export function offerDefaults(opening: {
  title: string;
  job_role_id: string | null;
  branch_id: string | null;
  employment_type: EmploymentRecord["employment_type"];
  pay_model: EmploymentRecord["pay_model"];
  salary_min: string | null;
}): Partial<Offer> {
  return {
    job_title: opening.title,
    job_role_id: opening.job_role_id,
    branch_id: opening.branch_id,
    employment_type: opening.employment_type,
    pay_model: opening.pay_model,
    basic_salary: opening.pay_model === "monthly" ? opening.salary_min : null,
    probation_months: 3,
  };
}

// ── HIR-03 letter templates ──

export type TemplateValues = { title: string; body: string; is_draft: boolean };

export function parseTemplate(
  formData: FormData,
  kind: LetterKind,
): Parsed<TemplateValues> {
  const errors: FieldErrors = {};
  const title = readText(formData, "title", 200, errors);
  if (!title) errors.title = "required";
  const body = String(formData.get("body") ?? "").replace(/\r\n?/g, "\n");
  if (body.trim() === "") errors.body = "required";
  else if (body.length > 40000) errors.body = "tooLong";
  else if (unknownFields(body, kind).length > 0)
    errors.body = "unknownMergeField";
  return done(
    {
      title: title ?? "",
      body: body.trim(),
      is_draft: readCheckbox(formData, "is_draft"),
    },
    errors,
  );
}

// ── HIR-07 probation ──

export type ReviewValues = {
  ratings: Record<ProbationCriterion, number>;
  comments: string;
  recommendation: Recommendation;
  extend_months: number | null;
};

export function parseProbationReview(formData: FormData): Parsed<ReviewValues> {
  const errors: FieldErrors = {};
  const ratings = {} as Record<ProbationCriterion, number>;
  for (const criterion of PROBATION_CRITERIA) {
    const value = readInteger(formData, `rating_${criterion}`, errors, {
      min: 1,
      max: 5,
    });
    if (value === null && !errors[`rating_${criterion}`])
      errors[`rating_${criterion}`] = "required";
    ratings[criterion] = value ?? 0;
  }
  const comments = readText(formData, "comments", 4000, errors);
  if (!comments) errors.comments = "required";
  const recommendation = readChoice(
    formData,
    "recommendation",
    RECOMMENDATIONS,
    errors,
    { required: true },
  );
  let extend_months: number | null = null;
  if (recommendation === "extend") {
    extend_months = readInteger(formData, "extend_months", errors, {
      min: 1,
      max: 6,
    });
    if (extend_months === null && !errors.extend_months)
      errors.extend_months = "required";
  }
  return done(
    {
      ratings,
      comments: comments ?? "",
      recommendation: recommendation ?? "confirm",
      extend_months,
    },
    errors,
  );
}

export type ProbationState =
  | "none"
  | "on_probation"
  | "due"
  | "overdue"
  | "review_submitted"
  | "confirmed";

/** Where someone is with probation, from their current contract and latest review. */
export function probationState(
  record: Pick<EmploymentRecord, "probation_end" | "confirmed_on"> | null,
  latest: Pick<ProbationReview, "status" | "due_date"> | null,
  today: string,
): { state: ProbationState; daysLeft: number | null } {
  if (!record?.probation_end) return { state: "none", daysLeft: null };
  if (record.confirmed_on) return { state: "confirmed", daysLeft: null };
  const daysLeft = Math.round(
    (Date.parse(record.probation_end) - Date.parse(today)) / 86_400_000,
  );
  if (latest?.status === "submitted")
    return { state: "review_submitted", daysLeft };
  if (daysLeft < 0) return { state: "overdue", daysLeft };
  if (daysLeft <= 30) return { state: "due", daysLeft };
  return { state: "on_probation", daysLeft };
}

/** Average of the five ratings, one decimal ("4.2"). */
export function averageRating(ratings: Partial<Record<string, number>>) {
  const values = PROBATION_CRITERIA.map((c) => ratings[c]).filter(
    (v): v is number => typeof v === "number" && v > 0,
  );
  if (values.length === 0) return null;
  return (values.reduce((a, b) => a + b, 0) / values.length).toFixed(1);
}

// ── HIR-04 pre-boarding progress ──

export const PREBOARDING_STEPS = [
  "offer",
  "personal",
  "statutory",
  "bank",
  "emergency",
  "dependents",
  "credentials",
] as const;
export type PreboardingStep = (typeof PREBOARDING_STEPS)[number];

/** Which portal steps are complete. Dependents are optional, so never block. */
export function preboardingProgress(
  ctx: Pick<
    PreboardingContext,
    "offer" | "employee" | "bank" | "required" | "credentials"
  >,
): Record<PreboardingStep, boolean> {
  const e = ctx.employee;
  const held = new Set(
    ctx.credentials
      .filter((c) => c.status === "pending" || c.status === "verified")
      .map((c) => c.credential_type_id),
  );
  return {
    offer: ctx.offer?.status === "accepted",
    personal: Boolean(
      e?.id_no_last4 && e.date_of_birth && e.phone && e.address,
    ),
    statutory: Boolean(e?.pcb_category),
    bank: Boolean(ctx.bank),
    emergency: Boolean(e?.emergency_contact?.name && e.emergency_contact.phone),
    dependents: Boolean(e),
    credentials:
      Boolean(e) &&
      ctx.required
        .filter((r) => r.requirement === "mandatory")
        .every((r) => held.has(r.credential_type_id)),
  };
}
