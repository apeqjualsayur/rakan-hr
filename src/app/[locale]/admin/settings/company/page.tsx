import { getTranslations } from "next-intl/server";
import { requireMember } from "@/lib/auth/member";
import { ADMIN_ROLES, can } from "@/lib/auth/roles";
import { COMPANY_COLUMNS, type CompanyValues } from "@/lib/settings/company";
import { createClient } from "@/lib/supabase/server";
import { CompanyForm } from "./CompanyForm";

export async function generateMetadata() {
  const t = await getTranslations("Settings.company");
  return { title: t("title") };
}

// ORG-01 / ORG-02. Values come from the tenants row, which `npm run db:seed` prefills
// from company-config.yaml (TBC values stay blank).
export default async function CompanyPage() {
  const member = await requireMember(ADMIN_ROLES);
  const supabase = await createClient();
  const { data: company } = await supabase
    .from("tenants")
    .select(COMPANY_COLUMNS)
    .eq("id", member.tenantId!)
    .single<CompanyValues>();

  return (
    <CompanyForm company={company} canEdit={can(member.role, "editCompany")} />
  );
}
