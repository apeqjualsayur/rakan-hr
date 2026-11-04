// Shared shapes for the Settings forms (Step 4). Parsers are pure so they are unit-tested;
// error values are message keys under Settings.errors in messages/*.json.

export type ErrorKey =
  | "required"
  | "tooLong"
  | "invalidDate"
  | "invalidState"
  | "paydayBeforeHire"
  | "invalidCoordinates"
  | "coordinatesPair"
  | "invalidRadius"
  | "invalidHours"
  | "invalidEmail"
  | "invalidRole"
  | "alreadyMember"
  | "memberElsewhere"
  | "lastOwner"
  | "forbidden"
  | "notFound"
  | "saveFailed"
  // People (Step 5)
  | "invalidChoice"
  | "invalidMykad"
  | "invalidMykadDate"
  | "invalidMykadPlace"
  | "invalidPassport"
  | "duplicateId"
  | "invalidPhone"
  | "invalidMoney"
  | "invalidNumber"
  | "rateRequired"
  | "beforeStart"
  | "managerLoop"
  | "invalidAccountNo"
  | "pendingExists"
  | "notLinked"
  // Credentials (Step 6)
  | "expiryBeforeEffective"
  | "noFiles"
  | "methodRequired"
  | "reasonRequired"
  | "ownCredential"
  | "notPending"
  // Policies and signatures (Step 7)
  | "nameMismatch"
  | "alreadySigned"
  | "documentChanged"
  | "notPdf"
  // Hiring (Step 8)
  | "rangeOrder"
  | "unknownMergeField"
  | "offerNotDraft"
  | "offerNotOpen"
  | "offerAccepted"
  | "offerNotAccepted"
  | "badStage"
  | "useConvert"
  | "alreadyConverted"
  | "sessionEnded"
  | "reviewOpen"
  | "noProbation"
  | "letterFailed";

export type FieldErrors = Partial<Record<string, ErrorKey>>;

export type FormState =
  | { status: "idle" }
  | { status: "saved"; at: number }
  | { status: "error"; errors?: FieldErrors; message?: ErrorKey };

export const idle: FormState = { status: "idle" };

export type Parsed<T> =
  { ok: true; values: T } | { ok: false; errors: FieldErrors };

/** Trimmed text, or null when blank. Records `tooLong` past `max` characters. */
export function readText(
  formData: FormData,
  name: string,
  max: number,
  errors: FieldErrors,
): string | null {
  const value = String(formData.get(name) ?? "").trim();
  if (value.length > max) errors[name] = "tooLong";
  return value === "" ? null : value;
}

/** "YYYY-MM-DD" from a date input, or null when blank. Records `invalidDate`. */
export function readDate(
  formData: FormData,
  name: string,
  errors: FieldErrors,
): string | null {
  const value = String(formData.get(name) ?? "").trim();
  if (value === "") return null;
  if (!isIsoDate(value)) {
    errors[name] = "invalidDate";
    return null;
  }
  return value;
}

export function isIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

/**
 * The page language sent by a form (hidden "locale" field). Server Actions cannot read the
 * URL's locale (see src/i18n/request.ts), so forms that redirect pass it along.
 */
export function formLocale(formData: FormData): "en" | "ms" {
  return formData.get("locale") === "ms" ? "ms" : "en";
}

export function done<T>(values: T, errors: FieldErrors): Parsed<T> {
  return Object.keys(errors).length > 0
    ? { ok: false, errors }
    : { ok: true, values };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}
