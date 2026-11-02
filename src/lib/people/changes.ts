// EMP-07 profile change requests: what staff may ask to change, and the request form.
// The database (request_profile_change) validates again and stores bank numbers encrypted.
import {
  done,
  readText,
  type FieldErrors,
  type Parsed,
} from "@/lib/settings/form";
import { readEmail, readPhone } from "./fields";
import { parseBankAccount } from "./records";

export const CHANGE_FIELDS = [
  "phone",
  "email",
  "address",
  "emergency_contact",
  "bank_account",
] as const;
export type ChangeField = (typeof CHANGE_FIELDS)[number];

export type ChangeStatus = "pending" | "approved" | "rejected" | "cancelled";

export type ChangeRequest = {
  id: string;
  employee_id: string;
  field: ChangeField;
  old_value: Record<string, string | null> | null;
  new_value: Record<string, string | null>;
  note: string | null;
  status: ChangeStatus;
  approval_id: string | null;
  decided_at: string | null;
  created_at: string;
};

export const CHANGE_COLUMNS =
  "id, employee_id, field, old_value, new_value, note, status, approval_id, decided_at, created_at";

export function isChangeField(value: unknown): value is ChangeField {
  return (CHANGE_FIELDS as readonly unknown[]).includes(value);
}

/** Bank changes are always flagged (ui-system.md: Bank change tag = danger). */
export function changeCategory(field: ChangeField) {
  return field === "bank_account" ? "bank_change" : "profile_change";
}

export type ChangePayload = {
  field: ChangeField;
  value: Record<string, string>;
  note: string | null;
};

export function parseChangeRequest(
  formData: FormData,
  bankCodes: readonly string[],
): Parsed<ChangePayload> {
  const errors: FieldErrors = {};
  const field = formData.get("field");
  const note = readText(formData, "note", 500, errors);
  if (!isChangeField(field))
    return { ok: false, errors: { field: "invalidChoice" } };

  const value: Record<string, string> = {};
  switch (field) {
    case "phone": {
      const phone = readPhone(formData, "value", errors);
      if (phone) value.value = phone;
      else errors.value ??= "required";
      break;
    }
    case "email": {
      const email = readEmail(formData, "value", errors);
      if (email) value.value = email;
      else errors.value ??= "required";
      break;
    }
    case "address": {
      const address = readText(formData, "value", 500, errors);
      if (address) value.value = address;
      else errors.value ??= "required";
      break;
    }
    case "emergency_contact": {
      const name = readText(formData, "emergency_name", 200, errors);
      const relationship = readText(
        formData,
        "emergency_relationship",
        60,
        errors,
      );
      const phone = readPhone(formData, "emergency_phone", errors);
      if (!name) errors.emergency_name = "required";
      if (!phone) errors.emergency_phone ??= "required";
      Object.assign(value, {
        name: name ?? "",
        relationship: relationship ?? "",
        phone: phone ?? "",
      });
      break;
    }
    case "bank_account": {
      const bank = parseBankAccount(formData, bankCodes);
      if (bank.ok) Object.assign(value, bank.values);
      else Object.assign(errors, bank.errors);
      break;
    }
  }
  return done({ field, value, note }, errors);
}

/** One line for a request's old or new value. Bank values only ever hold the last 4 digits. */
export function describeChangeValue(
  field: ChangeField,
  value: Record<string, string | null | undefined> | null,
  bankName: (code: string) => string,
): string | null {
  if (!value) return null;
  switch (field) {
    case "bank_account":
      return value.bank_code
        ? [
            `${bankName(value.bank_code)} ••${value.account_last4 ?? ""}`,
            value.holder_name,
          ]
            .filter(Boolean)
            .join(" · ")
        : null;
    case "emergency_contact": {
      const who = value.relationship
        ? `${value.name ?? ""} (${value.relationship})`
        : value.name;
      return [who, value.phone].filter(Boolean).join(" · ") || null;
    }
    default:
      return value.value ?? null;
  }
}
