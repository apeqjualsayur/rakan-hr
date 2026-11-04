import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { requireMember } from "@/lib/auth/member";
import { ADMIN_ROLES, can } from "@/lib/auth/roles";
import { malaysiaToday } from "@/lib/format";
import { loadHolidays, loadTeamLeave } from "@/lib/leave/server";
import { isUuid } from "@/lib/settings/form";
import { createClient } from "@/lib/supabase/server";
import { addDays, parseWeek } from "@/lib/time/logic";
import {
  SHIFT_COLUMNS,
  type RosterShift,
  type ShiftIssue,
} from "@/lib/time/types";
import { RosterBuilder } from "./RosterBuilder";

export async function generateMetadata() {
  const t = await getTranslations("Time.nav");
  return { title: t("roster") };
}

// ATT-02 / ATT-03 roster builder: one branch, one week, staff × days, with leave, holidays,
// credential compliance and the checks per shift. Copy last week; publish notifies staff.
export default async function RosterPage({
  searchParams,
}: PageProps<"/[locale]/admin/time/roster">) {
  const member = await requireMember(ADMIN_ROLES);
  const { week, branch: branchParam } = await searchParams;
  const t = await getTranslations("Time.roster");
  const supabase = await createClient();
  const monday = parseWeek(week, malaysiaToday());
  const sunday = addDays(monday, 6);
  const { data: branches } = await supabase
    .from("branches")
    .select("id, name")
    .order("created_at");
  const branchList = (branches ?? []) as { id: string; name: string | null }[];
  const branchId =
    isUuid(branchParam) && branchList.some((b) => b.id === branchParam)
      ? branchParam
      : branchList[0]?.id;
  if (!branchId)
    return (
      <Card>
        <EmptyState message={t("noBranch")} />
      </Card>
    );

  const [
    { data: shifts },
    { data: issues },
    { data: people },
    { data: compliance },
    leave,
    holidays,
  ] = await Promise.all([
    supabase
      .from("roster_shifts")
      .select(SHIFT_COLUMNS)
      .eq("branch_id", branchId)
      .gte("shift_date", monday)
      .lte("shift_date", sunday)
      .order("start_time")
      .returns<RosterShift[]>(),
    supabase.rpc("roster_week_issues", {
      p_branch_id: branchId,
      p_week_start: monday,
    }),
    supabase
      .from("employees")
      .select("id, full_name, job_title, branch_id")
      .in("status", ["active", "on_notice"])
      .is("deleted_at", null)
      .order("full_name"),
    supabase
      .from("v_credential_compliance")
      .select("employee_id, compliance_pct"),
    loadTeamLeave(supabase, monday, sunday),
    loadHolidays(supabase, monday, sunday),
  ]);
  const all = (people ?? []) as {
    id: string;
    full_name: string;
    job_title: string | null;
    branch_id: string | null;
  }[];
  const onRoster = new Set((shifts ?? []).map((s) => s.employee_id));
  const staff = all.filter(
    (p) => p.branch_id === branchId || onRoster.has(p.id),
  );

  return (
    <RosterBuilder
      monday={monday}
      branchId={branchId}
      branches={branchList}
      staff={staff}
      others={all.filter((p) => !staff.includes(p))}
      shifts={shifts ?? []}
      issues={(issues ?? []) as (ShiftIssue & { shift_id: string })[]}
      compliance={Object.fromEntries(
        (
          (compliance ?? []) as {
            employee_id: string;
            compliance_pct: number | null;
          }[]
        ).map((c) => [c.employee_id, c.compliance_pct]),
      )}
      leave={leave}
      holidays={holidays}
      canEdit={can(member.role, "editPeople")}
      today={malaysiaToday()}
    />
  );
}
