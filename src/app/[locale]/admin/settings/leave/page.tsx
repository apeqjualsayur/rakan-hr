import { getTranslations } from "next-intl/server";
import { requireMember } from "@/lib/auth/member";
import { can } from "@/lib/auth/roles";
import { loadLeaveTypes } from "@/lib/leave/server";
import {
  POLICY_COLUMNS,
  type LeavePolicy,
  type StatutoryMinimum,
} from "@/lib/leave/types";
import { createClient } from "@/lib/supabase/server";
import { LeaveSettings } from "./LeaveSettings";

export async function generateMetadata() {
  const t = await getTranslations("Settings.nav");
  return { title: t("leave") };
}

// LVE-01 / LVE-02 / LVE-03 Settings > Leave: types and entitlement per years of service,
// never below the Employment Act (shown per band, and refused by the database).
export default async function LeaveSettingsPage() {
  const member = await requireMember([
    "owner",
    "hr_admin",
    "payroll_approver",
    "auditor",
  ]);
  const supabase = await createClient();
  const [types, { data: policies }, { data: minimums }] = await Promise.all([
    loadLeaveTypes(supabase, false),
    supabase
      .from("leave_policies")
      .select(POLICY_COLUMNS)
      .order("min_service_months")
      .returns<LeavePolicy[]>(),
    supabase
      .from("statutory_leave_minimums")
      .select("leave_code, min_service_months, max_service_months, days")
      .returns<StatutoryMinimum[]>(),
  ]);
  return (
    <LeaveSettings
      types={types}
      policies={policies ?? []}
      minimums={minimums ?? []}
      canEdit={can(member.role, "editPeople")}
    />
  );
}
