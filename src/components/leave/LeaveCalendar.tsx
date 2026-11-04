import { ChevronLeft, ChevronRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Card } from "@/components/ui/Card";
import { Link } from "@/i18n/navigation";
import { dateFromIso, formatDate } from "@/lib/format";
import { eachDay, monthGrid, outByDay, shiftMonth } from "@/lib/leave/logic";
import type { Holiday, TeamLeave } from "@/lib/leave/types";
import { cn } from "@/lib/utils";

// LVE-06 team calendar: who is out each day (pending shown as such), public holidays and
// replacement days, and clashes — days when two or more people from one branch are out.
// A month grid on wide screens, a day-by-day list on phones.
export function LeaveCalendar({
  monthKey,
  leave,
  holidays,
  today,
  basePath,
}: {
  monthKey: string;
  leave: readonly TeamLeave[];
  holidays: readonly Holiday[];
  today: string;
  basePath: string;
}) {
  const t = useTranslations("Leave.calendar");
  const locale = useLocale();
  const year = Number(monthKey.slice(0, 4));
  const month = Number(monthKey.slice(5, 7));
  const first = `${monthKey}-01`;
  const last = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  const byDay = outByDay(leave, first, last);
  const holidayOn = new Map<string, Holiday[]>();
  for (const h of holidays)
    holidayOn.set(h.holiday_date, [
      ...(holidayOn.get(h.holiday_date) ?? []),
      h,
    ]);
  const clash = (day: string) => {
    const counts = new Map<string, number>();
    for (const l of byDay.get(day) ?? []) {
      const key = l.branch_id ?? "none";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.values()].some((n) => n >= 2);
  };
  const label = (l: TeamLeave) =>
    `${l.full_name}${l.type_name_en ? ` · ${locale === "ms" ? l.type_name_ms : l.type_name_en}` : ""}${
      l.status === "pending" ? ` (${t("pending")})` : ""
    }${l.half_day ? ` · ½` : ""}`;
  const monthName = formatDate(
    new Date(Date.UTC(year, month - 1, 15)),
    locale,
    "long",
  ).replace(/^[^,]*,\s*\d+\s*/, "");
  const weekdays = [1, 2, 3, 4, 5, 6, 0].map((d) =>
    new Intl.DateTimeFormat(locale === "ms" ? "ms-MY" : "en-GB", {
      weekday: "short",
      timeZone: "UTC",
    }).format(new Date(Date.UTC(2026, 10, 1 + d))),
  );

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-h2 text-ink">{monthName}</h2>
        <div className="flex gap-1">
          <Link
            href={`${basePath}?month=${shiftMonth(monthKey, -1)}`}
            aria-label={t("previous")}
            className="grid size-11 place-items-center rounded-full text-ink-soft hover:bg-canvas"
          >
            <ChevronLeft aria-hidden size={20} strokeWidth={1.75} />
          </Link>
          <Link
            href={`${basePath}?month=${shiftMonth(monthKey, 1)}`}
            aria-label={t("next")}
            className="grid size-11 place-items-center rounded-full text-ink-soft hover:bg-canvas"
          >
            <ChevronRight aria-hidden size={20} strokeWidth={1.75} />
          </Link>
        </div>
      </div>
      <div className="flex flex-wrap gap-4 text-meta text-ink-muted">
        <span className="inline-flex items-center gap-2">
          <span
            aria-hidden
            className="size-3 rounded-full bg-info-tint ring-1 ring-info"
          />
          {t("legendHoliday")}
        </span>
        <span className="inline-flex items-center gap-2">
          <span
            aria-hidden
            className="size-3 rounded-full bg-warning-tint ring-1 ring-warning"
          />
          {t("legendClash")}
        </span>
      </div>

      {/* Wide screens: month grid. */}
      <div className="hidden md:block">
        <div className="grid grid-cols-7 gap-1 pb-1 text-center text-label text-ink-muted">
          {weekdays.map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {monthGrid(year, month)
            .flat()
            .map((day, i) =>
              day === "" ? (
                <div key={`blank-${i}`} />
              ) : (
                <div
                  key={day}
                  className={cn(
                    "flex min-h-28 flex-col gap-1 rounded-tile border p-2 text-meta",
                    holidayOn.has(day)
                      ? "border-info/40 bg-info-tint/60"
                      : "border-border bg-surface",
                    clash(day) && "border-warning bg-warning-tint/50",
                    day === today && "ring-2 ring-primary",
                  )}
                >
                  <span className="font-medium text-ink tabular-nums">
                    {Number(day.slice(8))}
                  </span>
                  {(holidayOn.get(day) ?? []).map((h) => (
                    <span key={h.name_en} className="text-info">
                      {locale === "ms" ? h.name_ms : h.name_en}
                    </span>
                  ))}
                  {(byDay.get(day) ?? []).map((l) => (
                    <span
                      key={l.request_id}
                      className={cn(
                        "truncate",
                        l.status === "pending"
                          ? "text-ink-muted italic"
                          : "text-ink",
                      )}
                      title={label(l)}
                    >
                      {label(l)}
                    </span>
                  ))}
                </div>
              ),
            )}
        </div>
      </div>

      {/* Phones: only days with someone out or a holiday. */}
      <ul className="flex flex-col divide-y divide-border md:hidden">
        {eachDay(first, last)
          .filter(
            (day) => (byDay.get(day)?.length ?? 0) > 0 || holidayOn.has(day),
          )
          .map((day) => (
            <li
              key={day}
              className={cn(
                "flex flex-col gap-1 py-3",
                clash(day) && "bg-warning-tint/40 px-2",
              )}
            >
              <span className="text-label text-ink">
                {formatDate(dateFromIso(day), locale, "weekdayShort")}
                {clash(day) ? ` · ${t("clash")}` : ""}
              </span>
              {(holidayOn.get(day) ?? []).map((h) => (
                <span key={h.name_en} className="text-meta text-info">
                  {locale === "ms" ? h.name_ms : h.name_en}
                </span>
              ))}
              {(byDay.get(day) ?? []).map((l) => (
                <span key={l.request_id} className="text-meta text-ink">
                  {label(l)}
                </span>
              ))}
            </li>
          ))}
        {leave.length === 0 && holidays.length === 0 ? (
          <li className="py-3 text-body text-ink-muted">{t("empty")}</li>
        ) : null}
      </ul>
    </Card>
  );
}
