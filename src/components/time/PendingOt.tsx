import { getLocale, getTranslations } from "next-intl/server";
import { LeaveDecision } from "@/components/leave/LeaveBits";
import { CategoryTag } from "@/components/ui/CategoryTag";
import { EmptyState } from "@/components/ui/EmptyState";
import type { CurrentMember } from "@/lib/auth/member";
import { dateFromIso, formatDate, formatMoney } from "@/lib/format";
import { decidableApprovals, loadTeamLeave } from "@/lib/leave/server";
import { createClient } from "@/lib/supabase/server";
import {
  OT_COLUMNS,
  type OtCalculation,
  type OtRequest,
} from "@/lib/time/types";

// ATT-04: OT waiting for a decision, with what calc_ot() would pay and the month's OT
// hours against the limit. Approve / Reject only where the reader is the approver.
export async function PendingOt({ member }: { member: CurrentMember }) {
  const t = await getTranslations("Time.ot");
  const locale = await getLocale();
  const supabase = await createClient();
  const { data } = await supabase
    .from("ot_requests")
    .select(`${OT_COLUMNS}, employees (full_name)`)
    .eq("status", "pending")
    .order("work_date");
  const rows = (
    (data ?? []) as unknown as (OtRequest & {
      employees: { full_name: string } | null;
    })[]
  ).filter((r) => r.employee_id !== member.employeeId);
  if (rows.length === 0) return <EmptyState message={t("nonePending")} />;
  const first = rows[0]!.work_date;
  const last = rows.at(-1)!.work_date;
  const [decidable, team, previews] = await Promise.all([
    decidableApprovals(
      supabase,
      member.userId!,
      member.role!,
      rows.map((r) => r.approval_id).filter(Boolean) as string[],
    ),
    loadTeamLeave(supabase, first, last),
    Promise.all(
      rows.map(async (r) => {
        const { data: calc } = await supabase.rpc("preview_ot", {
          p_work_date: r.work_date,
          p_hours: Number(r.hours),
          p_employee_id: r.employee_id,
        });
        return calc as OtCalculation | null;
      }),
    ),
  ]);
  // Managers cannot read colleagues' employee rows; the directory (every member reads
  // it) has their names.
  const { data: directory } = await supabase
    .from("v_directory")
    .select("id, full_name")
    .in("id", [...new Set(rows.map((r) => r.employee_id))]);
  const name = (r: (typeof rows)[number]) =>
    r.employees?.full_name ??
    (directory ?? []).find((d) => d.id === r.employee_id)?.full_name ??
    team.find((l) => l.employee_id === r.employee_id)?.full_name ??
    t("someone");

  return (
    <ul className="flex flex-col divide-y divide-border">
      {rows.map((r, i) => {
        const calc = previews[i];
        const monthAfter = (calc?.month_hours ?? 0) + Number(r.hours);
        return (
          <li
            key={r.id}
            className="flex flex-col gap-3 py-4 md:flex-row md:items-center"
          >
            <CategoryTag
              category="overtime"
              className="hidden self-start md:inline-flex md:self-center"
            />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <p className="text-h3 text-ink">
                {name(r)} · {t(`dayTypes.${r.day_type}`)},{" "}
                {formatDate(dateFromIso(r.work_date), locale, "weekdayShort")} (
                {t("hoursCount", { hours: Number(r.hours) })})
              </p>
              <p className="text-meta text-ink-muted">
                {[
                  calc?.covered
                    ? t("pays", {
                        amount: formatMoney(String(calc.amount ?? 0)),
                      })
                    : calc
                      ? t(`notCovered.${calc.method as "none"}`)
                      : null,
                  calc?.month_limit
                    ? monthAfter > calc.month_limit
                      ? t("overLimit", {
                          hours: String(monthAfter),
                          limit: String(calc.month_limit),
                        })
                      : t("monthHours", {
                          hours: String(monthAfter),
                          limit: String(calc.month_limit),
                        })
                    : null,
                  r.reason,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            {r.approval_id && decidable.has(r.approval_id) ? (
              <LeaveDecision approvalId={r.approval_id} />
            ) : (
              <span className="text-meta text-ink-muted">{t("waiting")}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
