import { getTranslations } from "next-intl/server";
import { OrgChart } from "@/components/people/OrgChart";
import { requireMember } from "@/lib/auth/member";
import { STAFF_ROLES } from "@/lib/auth/roles";
import { loadDirectory } from "@/lib/people/server";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata() {
  const t = await getTranslations("People.orgChart");
  return { title: t("title") };
}

// EMP-09 org chart for staff and managers.
export default async function StaffOrgChartPage() {
  await requireMember(STAFF_ROLES);
  const t = await getTranslations("People.orgChart");
  const people = await loadDirectory(await createClient());
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-display-sm text-ink">{t("title")}</h1>
        <p className="text-meta text-ink-muted">{t("intro")}</p>
      </div>
      <OrgChart people={people} />
    </div>
  );
}
