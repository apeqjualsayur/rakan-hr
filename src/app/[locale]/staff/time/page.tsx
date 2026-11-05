import { CalendarDays, Receipt } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { OtForm, MyOt } from "@/components/time/OtBits";
import { TodayCard } from "@/components/time/TodayCard";
import { Card, CardHeader } from "@/components/ui/Card";
import { Link } from "@/i18n/navigation";
import { requireMember } from "@/lib/auth/member";
import { STAFF_ROLES } from "@/lib/auth/roles";
import {
  dateFromIso,
  formatClock,
  formatDate,
  formatTime,
  malaysiaToday,
} from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { addDays, hhmm, hoursBetween, weekStart } from "@/lib/time/logic";
import {
  ATTENDANCE_COLUMNS,
  OT_COLUMNS,
  SHIFT_COLUMNS,
  type AttendanceLog,
  type OtRequest,
  type RosterShift,
  type Today,
} from "@/lib/time/types";

export async function generateMetadata() {
  const t = await getTranslations("Time");
  return { title: t("title") };
}

// ATT-01 / ATT-02 / ATT-04 for staff: today (clock in / out), this and next week's
// published shifts, recent attendance, and OT requests. Leave sits one tap away.
export default async function StaffTimePage() {
  const member = await requireMember(STAFF_ROLES);
  const t = await getTranslations("Time");
  const locale = await getLocale();
  const supabase = await createClient();
  const today = malaysiaToday();
  const monday = weekStart(today);
  const [{ data: day }, { data: shifts }, { data: logs }, { data: ot }] =
    await Promise.all([
      supabase.rpc("my_today"),
      supabase
        .from("roster_shifts")
        .select(SHIFT_COLUMNS)
        .eq("employee_id", member.employeeId ?? "")
        .gte("shift_date", monday)
        .lte("shift_date", addDays(monday, 13))
        .order("shift_date")
        .returns<RosterShift[]>(),
      supabase
        .from("attendance_logs")
        .select(ATTENDANCE_COLUMNS)
        .eq("employee_id", member.employeeId ?? "")
        .is("deleted_at", null)
        .order("clock_in_at", { ascending: false })
        .limit(10)
        .returns<AttendanceLog[]>(),
      supabase
        .from("ot_requests")
        .select(OT_COLUMNS)
        .eq("employee_id", member.employeeId ?? "")
        .order("work_date", { ascending: false })
        .limit(20)
        .returns<OtRequest[]>(),
    ]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-display-sm text-ink">{t("title")}</h1>
        <div className="flex flex-wrap gap-x-4">
          <Link
            href="/staff/leave"
            className="inline-flex min-h-11 items-center gap-1 text-label text-primary underline-offset-4 hover:underline"
          >
            <CalendarDays aria-hidden size={18} strokeWidth={1.75} />
            {t("leaveLink")}
          </Link>
          <Link
            href="/staff/claims"
            className="inline-flex min-h-11 items-center gap-1 text-label text-primary underline-offset-4 hover:underline"
          >
            <Receipt aria-hidden size={18} strokeWidth={1.75} />
            {t("claimsLink")}
          </Link>
        </div>
      </div>
      {member.employeeId && day ? (
        <TodayCard
          today={day as Today}
          tenantId={member.tenantId!}
          employeeId={member.employeeId}
        />
      ) : (
        <p className="text-body text-ink-muted">{t("notLinked")}</p>
      )}

      <Card className="flex flex-col gap-2">
        <CardHeader title={t("myShifts")} />
        {(shifts ?? []).length === 0 ? (
          <p className="text-body text-ink-muted">{t("noShifts")}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {(shifts ?? []).map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between gap-3 py-3"
              >
                <span className="flex flex-col">
                  <span className="text-body font-medium text-ink">
                    {formatDate(
                      dateFromIso(s.shift_date),
                      locale,
                      "weekdayShort",
                    )}
                    {s.shift_date === today ? ` · ${t("todayTag")}` : ""}
                  </span>
                  <span className="text-meta text-ink-muted">
                    {[s.room_or_service, s.is_on_call ? t("onCall") : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <span className="text-body text-ink tabular-nums">
                  {formatClock(hhmm(s.start_time), locale)} –{" "}
                  {formatClock(hhmm(s.end_time), locale)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="flex flex-col gap-2">
        <CardHeader title={t("myAttendance")} />
        {(logs ?? []).length === 0 ? (
          <p className="text-body text-ink-muted">{t("noAttendance")}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {(logs ?? []).map((l) => (
              <li
                key={l.id}
                className="flex items-center justify-between gap-3 py-3"
              >
                <span className="flex flex-col">
                  <span className="text-body font-medium text-ink">
                    {formatDate(
                      dateFromIso(l.work_date),
                      locale,
                      "weekdayShort",
                    )}
                  </span>
                  <span className="text-meta text-ink-muted">
                    {l.within_geofence === false
                      ? `${t("outside")}: ${l.outside_reason}`
                      : l.source === "manual"
                        ? t("manual")
                        : t("atCentre")}
                  </span>
                </span>
                <span className="text-body text-ink tabular-nums">
                  {formatTime(new Date(l.clock_in_at), locale)} –{" "}
                  {l.clock_out_at
                    ? formatTime(new Date(l.clock_out_at), locale)
                    : "…"}
                  {l.clock_out_at
                    ? ` · ${t("hours", { hours: hoursBetween(l.clock_in_at, l.clock_out_at)! })}`
                    : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {member.employeeId ? (
        <section id="overtime" className="flex flex-col gap-3">
          <h2 className="text-h2 text-ink">{t("ot.title")}</h2>
          <OtForm />
          <Card>
            <MyOt requests={ot ?? []} />
          </Card>
        </section>
      ) : null}
    </div>
  );
}
