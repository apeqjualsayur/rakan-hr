import { getTranslations } from "next-intl/server";
import { requireMember } from "@/lib/auth/member";
import { ADMIN_ROLES, can } from "@/lib/auth/roles";
import { CLAIM_TYPE_COLUMNS, type ClaimType } from "@/lib/claims/types";
import { createClient } from "@/lib/supabase/server";
import { ClaimSettings } from "./ClaimSettings";

export async function generateMetadata() {
  const t = await getTranslations("Settings.nav");
  return { title: t("claims") };
}

// CLM-01 Settings > Claims: claim types with their limits, who may claim them, whether
// they are taxable, and the company's mileage rate per km.
export default async function ClaimSettingsPage() {
  const member = await requireMember(ADMIN_ROLES);
  const supabase = await createClient();
  const [{ data: types }, { data: roles }, { data: tenant }] =
    await Promise.all([
      supabase
        .from("claim_types")
        .select(CLAIM_TYPE_COLUMNS)
        .order("sort_order")
        .order("name_en")
        .returns<ClaimType[]>(),
      supabase.from("job_roles").select("id, name").order("sort_order"),
      supabase.from("tenants").select("mileage_rate_per_km").maybeSingle(),
    ]);
  return (
    <ClaimSettings
      types={types ?? []}
      roles={(roles ?? []) as { id: string; name: string }[]}
      mileageRate={(tenant?.mileage_rate_per_km as string | null) ?? null}
      canEdit={can(member.role, "editPeople")}
      canEditRate={can(member.role, "editCompany")}
    />
  );
}
