"use server";

import { refresh } from "next/cache";
import { parseCompanyForm } from "@/lib/settings/company";
import type { FormState } from "@/lib/settings/form";
import { failed, saved, settingsContext } from "@/lib/settings/server";

// ORG-01 / ORG-02. Owner only (tenants_update policy). Changing the first hire or payday
// date moves the checklist deadlines (database trigger).
export async function saveCompany(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await settingsContext("editCompany");
  if (!ctx) return failed("forbidden");

  const parsed = parseCompanyForm(formData);
  if (!parsed.ok) return { status: "error", errors: parsed.errors };

  const { data, error } = await ctx.supabase
    .from("tenants")
    .update(parsed.values)
    .eq("id", ctx.member.tenantId)
    .select("id");
  if (error) {
    console.error("saveCompany failed", error.code, error.message);
    return failed("saveFailed");
  }
  if (!data?.length) return failed("forbidden");

  refresh();
  return saved();
}
