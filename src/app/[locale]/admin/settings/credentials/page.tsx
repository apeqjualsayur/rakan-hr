import { getTranslations } from "next-intl/server";
import { requireMember } from "@/lib/auth/member";
import { ADMIN_ROLES, can } from "@/lib/auth/roles";
import { loadTypes } from "@/lib/credentials/server";
import { createClient } from "@/lib/supabase/server";
import {
  CredentialSettings,
  type RequirementCell,
  type RoleColumn,
} from "./CredentialSettings";

export async function generateMetadata() {
  const t = await getTranslations("Settings.credentials");
  return { title: t("title") };
}

// Settings > Credentials (Step 6): the credential catalogue and what each job role needs.
export default async function CredentialSettingsPage() {
  const member = await requireMember(ADMIN_ROLES);
  const supabase = await createClient();
  const [types, { data: roles }, { data: requirements }, { data: tenant }] =
    await Promise.all([
      loadTypes(supabase, { activeOnly: false }),
      supabase
        .from("job_roles")
        .select("id, name, is_clinical")
        .order("sort_order")
        .returns<RoleColumn[]>(),
      supabase
        .from("role_credential_requirements")
        .select("job_role_id, credential_type_id, requirement, blocks_roster")
        .returns<RequirementCell[]>(),
      supabase
        .from("tenants")
        .select("credential_enforcement")
        .eq("id", member.tenantId!)
        .single(),
    ]);
  return (
    <CredentialSettings
      types={types}
      roles={roles ?? []}
      requirements={requirements ?? []}
      canEdit={can(member.role, "editPeople")}
      enforcement={tenant?.credential_enforcement === "hard" ? "hard" : "soft"}
    />
  );
}
