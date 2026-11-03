// Step 7 row shapes (data-model.md §3.4b).
import type { Audience } from "./logic";

export type Announcement = {
  id: string;
  title_en: string;
  title_ms: string;
  body_en: string;
  body_ms: string;
  audience: Audience;
  pinned: boolean;
  publish_at: string;
  created_at: string;
};

export const ANNOUNCEMENT_COLUMNS =
  "id, title_en, title_ms, body_en, body_ms, audience, pinned, publish_at, created_at";

export type PolicyDocument = {
  id: string;
  code: string;
  title_en: string;
  title_ms: string;
  version: number;
  file_path: string;
  document_sha256: string;
  audience: Audience;
  requires_signature: boolean;
  published_at: string;
  superseded_at: string | null;
};

export const POLICY_COLUMNS =
  "id, code, title_en, title_ms, version, file_path, document_sha256, audience, requires_signature, published_at, superseded_at";

export type Signature = {
  id: string;
  entity_type: string;
  entity_id: string;
  signer_user_id: string | null;
  signer_employee_id: string | null;
  typed_name: string;
  signed_at: string;
  document_sha256: string;
  signed_pdf_path: string;
};

export const SIGNATURE_COLUMNS =
  "id, entity_type, entity_id, signer_user_id, signer_employee_id, typed_name, signed_at, document_sha256, signed_pdf_path";

export type AckRow = {
  employee_id: string;
  full_name: string;
  employee_no: string;
  has_account: boolean;
  signature_id: string | null;
  signed_at: string | null;
};
