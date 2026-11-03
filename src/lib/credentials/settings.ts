// Settings > Credentials (CRD-01, CRD-02, CRD-03, CRD-19): the credential type form.
import {
  done,
  readText,
  type FieldErrors,
  type Parsed,
} from "@/lib/settings/form";
import { readCheckbox, readDecimal, readInteger } from "@/lib/people/fields";

export type TypeValues = {
  name_en: string;
  name_ms: string;
  issuing_body: string | null;
  has_expiry: boolean;
  default_validity_months: number | null;
  reminder_offsets_days: number[];
  tracks_cpd: boolean;
  cpd_points_required: string | null;
  cpd_cycle_months: number | null;
  restricted: boolean;
  is_active: boolean;
};

/** "90, 60, 30, 7" → [90, 60, 30, 7] (largest first, no repeats); null when invalid. */
export function parseOffsets(text: string): number[] | null {
  const parts = text.split(/[\s,;]+/).filter(Boolean);
  if (parts.length === 0 || parts.length > 8) return null;
  const days = parts.map(Number);
  if (days.some((d) => !Number.isInteger(d) || d < 1 || d > 365)) return null;
  return [...new Set(days)].sort((a, b) => b - a);
}

export function parseCredentialType(formData: FormData): Parsed<TypeValues> {
  const errors: FieldErrors = {};
  const name_en = readText(formData, "name_en", 120, errors);
  const name_ms = readText(formData, "name_ms", 120, errors);
  if (!name_en) errors.name_en = "required";
  if (!name_ms) errors.name_ms = "required";
  const has_expiry = readCheckbox(formData, "has_expiry");
  const tracks_cpd = readCheckbox(formData, "tracks_cpd");
  const offsets = parseOffsets(
    String(formData.get("reminder_offsets_days") ?? "90, 60, 30, 7"),
  );
  if (has_expiry && !offsets) errors.reminder_offsets_days = "invalidNumber";
  return done(
    {
      name_en: name_en ?? "",
      name_ms: name_ms ?? "",
      issuing_body: readText(formData, "issuing_body", 200, errors),
      has_expiry,
      default_validity_months: has_expiry
        ? readInteger(formData, "default_validity_months", errors, {
            min: 1,
            max: 120,
          })
        : null,
      reminder_offsets_days: offsets ?? [90, 60, 30, 7],
      tracks_cpd,
      cpd_points_required: tracks_cpd
        ? readDecimal(formData, "cpd_points_required", errors, {
            min: 0.5,
            max: 999,
            places: 1,
          })
        : null,
      cpd_cycle_months: tracks_cpd
        ? readInteger(formData, "cpd_cycle_months", errors, {
            min: 1,
            max: 120,
          })
        : null,
      restricted: readCheckbox(formData, "restricted"),
      is_active: readCheckbox(formData, "is_active"),
    },
    errors,
  );
}

/** A code for a company's own type: "Hanen certification" → CUSTOM_HANEN_CERTIFICATION. */
export function customCode(name: string, taken: readonly string[]) {
  const base = `CUSTOM_${
    name
      .normalize("NFKD")
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 30) || "TYPE"
  }`;
  let code = base;
  for (let n = 2; taken.includes(code); n++) code = `${base}_${n}`;
  return code;
}
