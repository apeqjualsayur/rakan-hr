"use server";

import { refresh } from "next/cache";
import type { ErrorKey, FormState } from "@/lib/settings/form";
import { isUuid } from "@/lib/settings/form";
import { failed, saved, settingsContext } from "@/lib/settings/server";
import {
  BANK_FILE_FORMAT_COLUMNS,
  parseAccountDetails,
  parseCompanyAccount,
  parseMappingForm,
  type BankFileFormat,
} from "./accounts";

// Step 12 (PAY-10) Settings > Company bank accounts. Owner only (company_bank_accounts
// policies); the trigger keeps one default, fixes the number and freezes retired accounts.

const HINTS: Record<string, ErrorKey> = {
  number_fixed: "accountNoFixed",
  retired: "accountRetired",
  format: "formatMismatch",
  account_no: "invalidAccountNo",
};

function errorKey(
  error: { code?: string; hint?: string | null; message: string },
  context: string,
): ErrorKey {
  if (error.hint && HINTS[error.hint]) return HINTS[error.hint]!;
  if (error.code === "42501") return "forbidden";
  console.error(`${context} failed`, error.code, error.message);
  return "saveFailed";
}

async function loadFormats(
  supabase: NonNullable<
    Awaited<ReturnType<typeof settingsContext>>
  >["supabase"],
) {
  const [{ data: banks }, { data: formats }] = await Promise.all([
    supabase.from("banks").select("code").eq("is_active", true),
    supabase
      .from("bank_file_formats")
      .select(BANK_FILE_FORMAT_COLUMNS)
      .eq("is_active", true)
      .returns<BankFileFormat[]>(),
  ]);
  return {
    bankCodes: (banks ?? []).map((b) => b.code as string),
    formats: formats ?? [],
  };
}

export async function addCompanyAccount(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await settingsContext("manageCompanyBank");
  if (!ctx) return failed("forbidden");
  const { bankCodes, formats } = await loadFormats(ctx.supabase);
  const parsed = parseCompanyAccount(formData, bankCodes, formats);
  if (!parsed.ok) return { status: "error", errors: parsed.errors };
  const { error } = await ctx.supabase
    .from("company_bank_accounts")
    .insert({ ...parsed.values, tenant_id: ctx.member.tenantId });
  if (error) {
    const key = errorKey(error, "addCompanyAccount");
    return key === "invalidAccountNo"
      ? { status: "error", errors: { account_no: key } }
      : failed(key);
  }
  refresh();
  return saved();
}

export async function saveAccountDetails(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await settingsContext("manageCompanyBank");
  const id = formData.get("account_id");
  if (!ctx || !isUuid(id)) return failed("forbidden");
  const { data: account } = await ctx.supabase
    .from("company_bank_accounts")
    .select("bank_code")
    .eq("id", id)
    .maybeSingle();
  if (!account) return failed("notFound");
  const { formats } = await loadFormats(ctx.supabase);
  const parsed = parseAccountDetails(
    formData,
    account.bank_code as string,
    formats,
  );
  if (!parsed.ok) return { status: "error", errors: parsed.errors };
  const { error } = await ctx.supabase
    .from("company_bank_accounts")
    .update(parsed.values)
    .eq("id", id);
  if (error) return failed(errorKey(error, "saveAccountDetails"));
  refresh();
  return saved();
}

/** The account's own GENERIC_CSV columns; "reset" goes back to the format's default. */
export async function saveColumnMapping(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await settingsContext("manageCompanyBank");
  const id = formData.get("account_id");
  if (!ctx || !isUuid(id)) return failed("forbidden");
  let mapping = null;
  if (formData.get("reset") !== "true") {
    const parsed = parseMappingForm(formData);
    if (!parsed.ok) return { status: "error", errors: parsed.errors };
    mapping = parsed.values;
  }
  const { error } = await ctx.supabase
    .from("company_bank_accounts")
    .update({ column_mapping: mapping })
    .eq("id", id);
  if (error) return failed(errorKey(error, "saveColumnMapping"));
  refresh();
  return saved();
}

export async function setDefaultAccount(id: string): Promise<FormState> {
  const ctx = await settingsContext("manageCompanyBank");
  if (!ctx || !isUuid(id)) return failed("forbidden");
  const { error } = await ctx.supabase
    .from("company_bank_accounts")
    .update({ is_default: true })
    .eq("id", id);
  if (error) return failed(errorKey(error, "setDefaultAccount"));
  refresh();
  return saved();
}

/** Retired accounts stay for history and are never deleted. */
export async function retireAccount(id: string): Promise<FormState> {
  const ctx = await settingsContext("manageCompanyBank");
  if (!ctx || !isUuid(id)) return failed("forbidden");
  const { error } = await ctx.supabase
    .from("company_bank_accounts")
    .update({ retired_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return failed(errorKey(error, "retireAccount"));
  refresh();
  return saved();
}
