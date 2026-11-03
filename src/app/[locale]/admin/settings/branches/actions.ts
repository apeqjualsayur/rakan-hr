"use server";

import { refresh } from "next/cache";
import { redirect } from "@/i18n/navigation";
import { parseBranchForm } from "@/lib/settings/branch";
import { formLocale, isUuid, type FormState } from "@/lib/settings/form";
import { failed, saved, settingsContext } from "@/lib/settings/server";

// ORG-03. Owner and HR admin (branches_insert / branches_update policies).
// `branch_id` is empty for a new branch; after creating one we go to its edit page.
export async function saveBranch(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await settingsContext("manageBranches");
  if (!ctx) return failed("forbidden");

  const parsed = parseBranchForm(formData);
  if (!parsed.ok) return { status: "error", errors: parsed.errors };

  const id = formData.get("branch_id");
  const query = isUuid(id)
    ? ctx.supabase.from("branches").update(parsed.values).eq("id", id)
    : ctx.supabase
        .from("branches")
        .insert({ ...parsed.values, tenant_id: ctx.member.tenantId });
  const { data, error } = await query.select("id");
  if (error) {
    console.error("saveBranch failed", error.code, error.message);
    return failed("saveFailed");
  }
  if (!data?.length) return failed(isUuid(id) ? "notFound" : "forbidden");

  if (!isUuid(id)) {
    redirect({
      href: `/admin/settings/branches/${data[0].id}?created=1`,
      locale: formLocale(formData),
    });
  }
  refresh();
  return saved();
}
