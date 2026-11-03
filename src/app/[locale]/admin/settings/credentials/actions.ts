"use server";

import { refresh } from "next/cache";
import { customCode, parseCredentialType } from "@/lib/credentials/settings";
import { isUuid, type FormState } from "@/lib/settings/form";
import { failed, saved, settingsContext } from "@/lib/settings/server";

// Settings > Credentials. Owner and HR admin (credential_types_* and
// role_credential_requirements_* policies).

export async function saveCredentialType(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await settingsContext("editPeople");
  if (!ctx) return failed("forbidden");
  const parsed = parseCredentialType(formData);
  if (!parsed.ok) return { status: "error", errors: parsed.errors };

  const id = formData.get("type_id");
  if (isUuid(id)) {
    const { data, error } = await ctx.supabase
      .from("credential_types")
      .update(parsed.values)
      .eq("id", id)
      .select("id");
    if (error) {
      console.error("saveCredentialType failed", error.code, error.message);
      return failed("saveFailed");
    }
    if (!data?.length) return failed("notFound");
  } else {
    const { data: existing } = await ctx.supabase
      .from("credential_types")
      .select("code");
    const { error } = await ctx.supabase.from("credential_types").insert({
      ...parsed.values,
      tenant_id: ctx.member.tenantId,
      code: customCode(
        parsed.values.name_en,
        (existing ?? []).map((t) => t.code as string),
      ),
      category: "other",
      sort_order: 1000,
    });
    if (error) {
      console.error("saveCredentialType failed", error.code, error.message);
      return failed("saveFailed");
    }
  }
  refresh();
  return saved();
}

/** CRD-03: one cell of the requirement matrix. "none" removes the requirement. */
export async function setRequirement(
  roleId: string,
  typeId: string,
  requirement: "none" | "mandatory" | "optional",
  blocksRoster: boolean,
): Promise<FormState> {
  const ctx = await settingsContext("editPeople");
  if (!ctx || !isUuid(roleId) || !isUuid(typeId)) return failed("forbidden");
  const { error } =
    requirement === "none"
      ? await ctx.supabase
          .from("role_credential_requirements")
          .delete()
          .eq("job_role_id", roleId)
          .eq("credential_type_id", typeId)
      : await ctx.supabase.from("role_credential_requirements").upsert(
          {
            job_role_id: roleId,
            credential_type_id: typeId,
            requirement,
            blocks_roster: requirement === "mandatory" && blocksRoster,
          },
          { onConflict: "job_role_id,credential_type_id" },
        );
  if (error) {
    console.error("setRequirement failed", error.code, error.message);
    return failed("saveFailed");
  }
  refresh();
  return saved();
}
