import { getTranslations } from "next-intl/server";
import { OrgChart } from "@/components/people/OrgChart";
import { requireMember } from "@/lib/auth/member";
import { ADMIN_ROLES } from "@/lib/auth/roles";
import { loadDirectory } from "@/lib/people/server";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata() {
  const t = await getTranslations("People.orgChart");
  return { title: t("title") };
}

// EMP-09 org chart from each person's manager ("Reports to").
export default async function OrgChartPage() {
  await requireMember(ADMIN_ROLES);
  const t = await getTranslations("People.orgChart");
  const people = await loadDirectory(await createClient());
  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-3xl text-meta text-ink-muted">{t("intro")}</p>
      <OrgChart people={people} recordBase="/admin/people" />
    </div>
  );
}
