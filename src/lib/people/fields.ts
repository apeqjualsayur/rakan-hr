// Form readers shared by the People forms (Step 5). Like lib/settings/form.ts they record
// error keys (Settings.errors) instead of throwing, so one submit shows every problem.
import type { FieldErrors } from "@/lib/settings/form";

/** One of `choices`, or null when blank. Records `invalidChoice` (or `required`). */
export function readChoice<T extends string>(
  formData: FormData,
  name: string,
  choices: readonly T[],
  errors: FieldErrors,
  { required = false } = {},
): T | null {
  const value = String(formData.get(name) ?? "");
  if (value === "") {
    if (required) errors[name] = "required";
    return null;
  }
  if (!(choices as readonly string[]).includes(value)) {
    errors[name] = "invalidChoice";
    return null;
  }
  return value as T;
}

/** A checkbox: present = true. */
export function readCheckbox(formData: FormData, name: string) {
  const value = formData.get(name);
  return value === "on" || value === "true" || value === "yes";
}

/** RM amount as a string for numeric(12,2) — never a float. "3,500" → "3500.00". */
export function readMoney(
  formData: FormData,
  name: string,
  errors: FieldErrors,
): string | null {
  const value = String(formData.get(name) ?? "")
    .replace(/,/g, "")
    .replace(/^RM\s*/i, "")
    .trim();
  if (value === "") return null;
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(value)) {
    errors[name] = "invalidMoney";
    return null;
  }
  const [whole, cents = ""] = value.split(".");
  return `${BigInt(whole!).toString()}.${cents.padEnd(2, "0")}`;
}

/** A decimal number within [min, max], as a string. */
export function readDecimal(
  formData: FormData,
  name: string,
  errors: FieldErrors,
  { min, max, places = 2 }: { min: number; max: number; places?: number },
): string | null {
  const value = String(formData.get(name) ?? "").trim();
  if (value === "") return null;
  const pattern = new RegExp(`^\\d{1,4}(\\.\\d{1,${places}})?$`);
  const n = Number(value);
  if (!pattern.test(value) || n < min || n > max) {
    errors[name] = "invalidNumber";
    return null;
  }
  return value;
}

export function readInteger(
  formData: FormData,
  name: string,
  errors: FieldErrors,
  { min, max }: { min: number; max: number },
): number | null {
  const value = String(formData.get(name) ?? "").trim();
  if (value === "") return null;
  const n = Number(value);
  if (!/^\d+$/.test(value) || n < min || n > max) {
    errors[name] = "invalidNumber";
    return null;
  }
  return n;
}

const PHONE = /^\+?[0-9][0-9 -]{5,19}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Malaysian or international phone: digits, spaces, dashes, optional leading +. */
export function readPhone(
  formData: FormData,
  name: string,
  errors: FieldErrors,
): string | null {
  const value = String(formData.get(name) ?? "").trim();
  if (value === "") return null;
  if (!PHONE.test(value)) {
    errors[name] = "invalidPhone";
    return null;
  }
  return value;
}

export function readEmail(
  formData: FormData,
  name: string,
  errors: FieldErrors,
): string | null {
  const value = String(formData.get(name) ?? "")
    .trim()
    .toLowerCase();
  if (value === "") return null;
  if (!EMAIL.test(value) || value.length > 254) {
    errors[name] = "invalidEmail";
    return null;
  }
  return value;
}

export function isPhone(value: string) {
  return PHONE.test(value.trim());
}
