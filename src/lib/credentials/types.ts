// Step 6 (CRD-01 → CRD-19): row shapes for credential tables and views (data-model.md §3.3).

export const DISPLAY_STATUSES = [
  "upcoming",
  "valid",
  "expiring_soon",
  "expired",
  "missing",
  "pending",
  "rejected",
] as const;
export type DisplayStatus = (typeof DISPLAY_STATUSES)[number];

export type Requirement = "mandatory" | "optional";

/** One row of v_credential_status: an employee × credential type that matters. */
export type CredentialStatusRow = {
  employee_id: string;
  credential_type_id: string;
  requirement: Requirement | null;
  blocks_roster: boolean;
  type_code: string;
  name_en: string;
  name_ms: string;
  category: string;
  restricted: boolean;
  has_expiry: boolean;
  tracks_cpd: boolean;
  sort_order: number;
  verified_id: string | null;
  effective_date: string | null;
  expiry_date: string | null;
  verified_at: string | null;
  pending_id: string | null;
  submitted_at: string | null;
  rejected_id: string | null;
  reject_reason: string | null;
  validity: Exclude<DisplayStatus, "missing" | "pending" | "rejected"> | null;
  display_status: DisplayStatus;
  days_left: number | null;
};

export const STATUS_COLUMNS =
  "employee_id, credential_type_id, requirement, blocks_roster, type_code, name_en, name_ms, category, restricted, has_expiry, tracks_cpd, sort_order, verified_id, effective_date, expiry_date, verified_at, pending_id, submitted_at, rejected_id, reject_reason, validity, display_status, days_left";

export type CredentialType = {
  id: string;
  code: string;
  name_en: string;
  name_ms: string;
  category: string;
  issuing_body: string | null;
  has_expiry: boolean;
  default_validity_months: number | null;
  reminder_offsets_days: number[];
  requires_verification: boolean;
  tracks_cpd: boolean;
  cpd_points_required: string | null;
  cpd_cycle_months: number | null;
  restricted: boolean;
  is_active: boolean;
  sort_order: number;
};

export const TYPE_COLUMNS =
  "id, code, name_en, name_ms, category, issuing_body, has_expiry, default_validity_months, reminder_offsets_days, requires_verification, tracks_cpd, cpd_points_required, cpd_cycle_months, restricted, is_active, sort_order";

export const RECORD_STATUSES = [
  "draft",
  "pending",
  "verified",
  "rejected",
  "superseded",
  "withdrawn",
] as const;
export type RecordStatus = (typeof RECORD_STATUSES)[number];

export type StaffCredential = {
  id: string;
  employee_id: string;
  credential_type_id: string;
  reference_no: string | null;
  issuing_body: string | null;
  effective_date: string;
  expiry_date: string | null;
  cpd_points: string | null;
  notes: string | null;
  status: RecordStatus;
  previous_id: string | null;
  submitted_by: string | null;
  submitted_at: string | null;
  verified_at: string | null;
  verify_method: string | null;
  reject_reason: string | null;
  created_at: string;
};

export const CREDENTIAL_COLUMNS =
  "id, employee_id, credential_type_id, reference_no, issuing_body, effective_date, expiry_date, cpd_points, notes, status, previous_id, submitted_by, submitted_at, verified_at, verify_method, reject_reason, created_at";

export type CredentialFile = {
  id: string;
  file_path: string;
  mime: string;
  size_bytes: number;
  page_no: number;
};

export const FILE_COLUMNS = "id, file_path, mime, size_bytes, page_no";

export const CPD_CATEGORIES = [
  "course",
  "conference",
  "workshop",
  "webinar",
  "reading",
  "other",
] as const;

export type CpdStatus = "pending" | "verified" | "rejected" | "withdrawn";

export type CpdActivity = {
  id: string;
  employee_id: string;
  credential_type_id: string;
  title: string;
  provider: string | null;
  activity_date: string;
  points: string;
  hours: string | null;
  category: (typeof CPD_CATEGORIES)[number];
  file_path: string | null;
  status: CpdStatus;
  reject_reason: string | null;
  submitted_by: string | null;
  created_at: string;
};

export const CPD_COLUMNS =
  "id, employee_id, credential_type_id, title, provider, activity_date, points, hours, category, file_path, status, reject_reason, submitted_by, created_at";

export type CpdProgress = {
  employee_id: string;
  credential_type_id: string;
  name_en: string;
  name_ms: string;
  credential_id: string | null;
  cycle_start: string | null;
  cycle_end: string | null;
  points_verified: string;
  points_pending: string;
  points_required: string | null;
  target_to_date: string | null;
  on_track: boolean | null;
};

export const CPD_PROGRESS_COLUMNS =
  "employee_id, credential_type_id, name_en, name_ms, credential_id, cycle_start, cycle_end, points_verified, points_pending, points_required, target_to_date, on_track";
