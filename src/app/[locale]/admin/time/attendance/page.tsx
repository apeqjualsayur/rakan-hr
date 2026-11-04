import { ChevronLeft, ChevronRight } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Link } from "@/i18n/navigation";
import { requireMember } from "@/lib/auth/member";
import { ADMIN_ROLES, can } from "@/lib/auth/roles";
import {
  dateFromIso,
  formatDate,
  formatTime,
  malaysiaToday,
} from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { addDays, hoursBetween, parseWeek } from "@/lib/time/logic";
import { ATTENDANCE_COLUMNS, type AttendanceLog } from "@/lib/time/types";
import { AttendanceForm, SelfieButton } from "./AttendanceForm";

export async function generateMetadata() {
  const t = await getTranslations("Time.nav");
  return { title: t("attendance") };
}

// ATT-01 / ATT-05: a week of clock-ins (where, why outside the fence, hours), weekly
// totals over the normal hours flagged, and HR's manual record / correction.
export default async function AttendancePage({
  searchParams,
}: PageProps<"/[locale]/admin/time/attendance">) {
  const member = await requireMember(ADMIN_ROLES);
  const { week } = await searchParams;
  const t = await getTranslations("Time.attendance");
  const locale = await getLocale();
  const supabase = await createClient();
  const monday = parseWeek(week, malaysiaToday());
  const [{ data: logs }, { data: people }, { data: params }] =
    await Promise.all([
      supabase
        .from("attendance_logs")
        .select(`${ATTENDANCE_COLUMNS}, employees (full_name)`)
        .is("deleted_at", null)
        .gte("work_date", monday)
        .lte("work_date", addDays(monday, 6))
        .order("clock_in_at"),
      supabase
        .from("employees")
        .select("id, full_name")
        .in("status", ["active", "on_notice"])
        .is("deleted_at", null)
        .order("full_name"),
      supabase.rpc("ea_parameters", { p_on: monday }),
    ]);
  const rows = (logs ?? []) as unknown as (AttendanceLog & {
    employees: { full_name: string } | null;
  })[];
  const cap = Number(
    (params as { normal_weekly_hours?: string } | null)?.normal_weekly_hours ??
      45,
  );
  const totals = new Map<string, { name: string; hours: number }>();
  for (const r of rows) {
    const h = hoursBetween(r.clock_in_at, r.clock_out_at) ?? 0;
    const cur = totals.get(r.employee_id) ?? {
      name: r.employees?.full_name ?? "",
      hours: 0,
    };
    totals.set(r.employee_id, { ...cur, hours: cur.hours + h });
  }
  const over = [...totals.values()].filter((x) => x.hours > cap);
  const href = (w: string) => `/admin/time/attendance?week=${w}`;
  const editor = can(member.role, "editPeople");
  const sensitive = can(member.role, "viewSensitive");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Link
          href={href(addDays(monday, -7))}
          aria-label={t("previous")}
          className="grid size-11 place-items-center rounded-full text-ink-soft hover:bg-surface"
        >
          <ChevronLeft aria-hidden size={20} strokeWidth={1.75} />
        </Link>
        <h2 className="text-h2 text-ink">
          {t("weekOf", {
            date: formatDate(dateFromIso(monday), locale, "full"),
          })}
        </h2>
        <Link
          href={href(addDays(monday, 7))}
          aria-label={t("next")}
          className="grid size-11 place-items-center rounded-full text-ink-soft hover:bg-surface"
        >
          <ChevronRight aria-hidden size={20} strokeWidth={1.75} />
        </Link>
      </div>
      {over.length ? (
        <p className="rounded-tile bg-warning-tint px-4 py-3 text-meta text-warning">
          {t("overCap", {
            cap,
            names: over
              .map((x) => `${x.name} (${x.hours.toFixed(1)} h)`)
              .join(", "),
          })}
        </p>
      ) : null}
      <Card className="flex flex-col gap-2 overflow-x-auto">
        <CardHeader title={t("title")} />
        {rows.length === 0 ? (
          <EmptyState message={t("none")} />
        ) : (
          <table className="w-full min-w-[760px] text-left">
            <thead>
              <tr className="border-b border-border text-label text-ink-muted">
                <th className="py-2 pr-3 font-medium">{t("person")}</th>
                <th className="py-2 pr-3 font-medium">{t("day")}</th>
                <th className="py-2 pr-3 font-medium">{t("inOut")}</th>
                <th className="py-2 pr-3 font-medium">{t("hours")}</th>
                <th className="py-2 pr-3 font-medium">{t("where")}</th>
                <th className="py-2 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.id} className="text-body text-ink">
                  <td className="py-3 pr-3">{r.employees?.full_name}</td>
                  <td className="py-3 pr-3">
                    {formatDate(
                      dateFromIso(r.work_date),
                      locale,
                      "weekdayShort",
                    )}
                  </td>
                  <td className="py-3 pr-3 tabular-nums">
                    {formatTime(new Date(r.clock_in_at), locale)} –{" "}
                    {r.clock_out_at
                      ? formatTime(new Date(r.clock_out_at), locale)
                      : t("open")}
                  </td>
                  <td className="py-3 pr-3 tabular-nums">
                    {hoursBetween(r.clock_in_at, r.clock_out_at) ?? "–"}
                  </td>
                  <td className="py-3 pr-3 text-meta">
                    {r.source === "manual" ? (
                      <span className="text-ink-muted">
                        {t("manual", { reason: r.manual_reason ?? "" })}
                      </span>
                    ) : r.within_geofence === false ? (
                      <span className="text-warning">
                        {t("outside", { reason: r.outside_reason ?? "" })}
                      </span>
                    ) : r.within_geofence ? (
                      <span className="text-primary">{t("inside")}</span>
                    ) : (
                      <span className="text-ink-muted">{t("noFence")}</span>
                    )}
                  </td>
                  <td className="py-3">
                    {sensitive && r.selfie_path ? (
                      <SelfieButton logId={r.id} />
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      {editor ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-h2 text-ink">{t("recordTitle")}</h2>
          <p className="text-meta text-ink-muted">{t("recordIntro")}</p>
          <AttendanceForm
            people={(people ?? []) as { id: string; full_name: string }[]}
          />
        </section>
      ) : null}
    </div>
  );
}
