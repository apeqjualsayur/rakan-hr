import { getLocale, getTranslations } from "next-intl/server";
import { CategoryTag } from "@/components/ui/CategoryTag";
import { EmptyState } from "@/components/ui/EmptyState";
import type { CurrentMember } from "@/lib/auth/member";
import { dateFromIso, formatDate } from "@/lib/format";
import { available, clashesFor, days as fmt } from "@/lib/leave/logic";
import { decidableApprovals, loadTeamLeave } from "@/lib/leave/server";
import {
  BALANCE_COLUMNS,
  REQUEST_COLUMNS,
  type LeaveBalance,
  type LeaveRequest,
} from "@/lib/leave/types";
import { createClient } from "@/lib/supabase/server";
import { AttachmentButton, LeaveDecision } from "./LeaveBits";

type Row = LeaveRequest & {
  employees: {
    full_name: string;
    branch_id: string | null;
    job_role_id: string | null;
  } | null;
  leave_types: { name_en: string; name_ms: string } | null;
};

// LVE-05 / LVE-06: pending leave the reader can see, oldest first, with what is left
// after it and who else from the same branch is out then. Approve / Reject appear only
// where the reader is the approver (manager on their phone; the owner can act on any).
export async function PendingLeave({
  member,
  showCertificates,
}: {
  member: CurrentMember;
  showCertificates: boolean;
}) {
  const t = await getTranslations("Leave.pending");
  const locale = await getLocale();
  const supabase = await createClient();
  const { data } = await supabase
    .from("leave_requests")
    .select(
      `${REQUEST_COLUMNS}, employees (full_name, branch_id, job_role_id), leave_types (name_en, name_ms)`,
    )
    .eq("status", "pending")
    .order("start_date");
  const rows = ((data ?? []) as unknown as Row[]).filter(
    (r) => r.employee_id !== member.employeeId,
  );
  if (rows.length === 0) return <EmptyState message={t("none")} />;

  const from = rows.map((r) => r.start_date).sort()[0]!;
  const to = rows
    .map((r) => r.end_date)
    .sort()
    .at(-1)!;
  const [team, decidable, { data: balances }] = await Promise.all([
    loadTeamLeave(supabase, from, to),
    decidableApprovals(
      supabase,
      member.userId!,
      member.role!,
      rows.map((r) => r.approval_id).filter(Boolean) as string[],
    ),
    supabase
      .from("leave_balances")
      .select(BALANCE_COLUMNS)
      .in("employee_id", [...new Set(rows.map((r) => r.employee_id))])
      .returns<LeaveBalance[]>(),
  ]);
  const d = (iso: string) => formatDate(dateFromIso(iso), locale, "short");
  // Managers cannot read colleagues' employee rows; team_leave() (which they can call)
  // carries the name, branch and role for everyone whose leave they see.
  const person = (r: Row) =>
    r.employees ?? team.find((l) => l.employee_id === r.employee_id) ?? null;

  return (
    <ul className="flex flex-col divide-y divide-border">
      {rows.map((r) => {
        const clashes = clashesFor(
          r,
          {
            branch_id: person(r)?.branch_id ?? null,
            job_role_id: person(r)?.job_role_id ?? null,
          },
          team,
        );
        const balance = (balances ?? []).find(
          (b) =>
            b.employee_id === r.employee_id &&
            b.leave_type_id === r.leave_type_id &&
            b.year === Number(r.start_date.slice(0, 4)),
        );
        const left = balance ? available(balance) : null;
        return (
          <li
            key={r.id}
            className="flex flex-col gap-3 py-4 md:flex-row md:items-center"
          >
            <CategoryTag
              category="leave"
              className="hidden self-start md:inline-flex md:self-center"
            />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <p className="text-h3 text-ink">
                {person(r)?.full_name} ·{" "}
                {locale === "ms"
                  ? r.leave_types?.name_ms
                  : r.leave_types?.name_en}
                ,{" "}
                {r.start_date === r.end_date
                  ? d(r.start_date)
                  : `${d(r.start_date)} – ${d(r.end_date)}`}{" "}
                ({t("days", { days: fmt(r.days) })})
              </p>
              <p className="text-meta text-ink-muted">
                {[
                  clashes.length
                    ? t("clash", {
                        names: [
                          ...new Set(clashes.map((c) => c.full_name)),
                        ].join(", "),
                      })
                    : t("noClash"),
                  left !== null ? t("leftAfter", { days: fmt(left) }) : null,
                  r.reason,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {clashes.length ? (
                <span className="sr-only">{t("clashWarning")}</span>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {showCertificates && r.attachment_path ? (
                <AttachmentButton requestId={r.id} />
              ) : null}
              {r.approval_id && decidable.has(r.approval_id) ? (
                <LeaveDecision approvalId={r.approval_id} />
              ) : (
                <span className="text-meta text-ink-muted">{t("waiting")}</span>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
