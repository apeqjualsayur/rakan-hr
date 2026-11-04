import { getLocale, getTranslations } from "next-intl/server";
import { CancelApprovedButton } from "@/components/leave/LeaveBits";
import { PendingLeave } from "@/components/leave/PendingLeave";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusChip } from "@/components/ui/StatusChip";
import { requireMember } from "@/lib/auth/member";
import { ADMIN_ROLES, can } from "@/lib/auth/roles";
import { dateFromIso, formatDate, malaysiaToday } from "@/lib/format";
import { days as fmt } from "@/lib/leave/logic";
import { REQUEST_COLUMNS, type LeaveRequest } from "@/lib/leave/types";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata() {
  const t = await getTranslations("Leave");
  return { title: t("adminTitle") };
}

// Requests waiting for a decision, and upcoming approved leave (HR can cancel it).
export default async function LeaveRequestsPage() {
  const member = await requireMember(ADMIN_ROLES);
  const t = await getTranslations("Leave");
  const locale = await getLocale();
  const supabase = await createClient();
  const { data } = await supabase
    .from("leave_requests")
    .select(
      `${REQUEST_COLUMNS}, employees (full_name), leave_types (name_en, name_ms)`,
    )
    .eq("status", "approved")
    .gte("end_date", malaysiaToday())
    .order("start_date")
    .limit(50);
  const upcoming = (data ?? []) as unknown as (LeaveRequest & {
    employees: { full_name: string } | null;
    leave_types: { name_en: string; name_ms: string } | null;
  })[];
  const d = (iso: string) => formatDate(dateFromIso(iso), locale, "short");
  const editor = can(member.role, "editPeople");
  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-col gap-2">
        <CardHeader title={t("toApprove")} />
        <PendingLeave
          member={member}
          showCertificates={can(member.role, "viewSensitive")}
        />
      </Card>
      <Card className="flex flex-col gap-2">
        <CardHeader title={t("upcoming")} />
        {upcoming.length === 0 ? (
          <EmptyState message={t("noUpcoming")} />
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {upcoming.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 py-3">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-body font-medium text-ink">
                    {r.employees?.full_name} ·{" "}
                    {locale === "ms"
                      ? r.leave_types?.name_ms
                      : r.leave_types?.name_en}
                  </span>
                  <span className="text-meta text-ink-muted">
                    {r.start_date === r.end_date
                      ? d(r.start_date)
                      : `${d(r.start_date)} – ${d(r.end_date)}`}{" "}
                    · {t("daysCount", { days: fmt(r.days) })}
                    {r.override_negative ? ` · ${t("overridden")}` : ""}
                  </span>
                </span>
                <StatusChip domain="leave" status="approved" />
                {editor ? <CancelApprovedButton requestId={r.id} /> : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
