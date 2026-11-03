import { getTranslations } from "next-intl/server";
import { CpdSection } from "@/components/credentials/CpdSection";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { requireMember } from "@/lib/auth/member";
import { STAFF_ROLES } from "@/lib/auth/roles";
import { loadTypes } from "@/lib/credentials/server";
import {
  CPD_COLUMNS,
  CPD_PROGRESS_COLUMNS,
  type CpdActivity,
  type CpdProgress,
} from "@/lib/credentials/types";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata() {
  const t = await getTranslations("Credentials.tabs");
  return { title: t("cpd") };
}

// CRD-18 / CRD-19 for the signed-in staff member.
export default async function MyCpdPage() {
  const member = await requireMember(STAFF_ROLES);
  const t = await getTranslations("Credentials.tabs");
  if (!member.employeeId) {
    const tm = await getTranslations("People.me");
    return (
      <Card>
        <EmptyState message={tm("notLinked")} />
      </Card>
    );
  }
  const supabase = await createClient();
  const [{ data: progress }, { data: activities }, types] = await Promise.all([
    supabase
      .from("v_cpd_progress")
      .select(CPD_PROGRESS_COLUMNS)
      .eq("employee_id", member.employeeId)
      .returns<CpdProgress[]>(),
    supabase
      .from("cpd_activities")
      .select(CPD_COLUMNS)
      .eq("employee_id", member.employeeId)
      .neq("status", "withdrawn")
      .order("activity_date", { ascending: false })
      .returns<CpdActivity[]>(),
    loadTypes(supabase),
  ]);
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-display-sm text-ink">{t("cpd")}</h1>
      <CpdSection
        progress={progress ?? []}
        activities={activities ?? []}
        types={types.filter((x) => x.tracks_cpd)}
      />
    </div>
  );
}
