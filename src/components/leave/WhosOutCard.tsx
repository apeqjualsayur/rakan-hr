import { getLocale, getTranslations } from "next-intl/server";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PersonRow } from "@/components/ui/PersonRow";
import { Link } from "@/i18n/navigation";
import { dateFromIso, formatDate, malaysiaToday } from "@/lib/format";
import { loadTeamLeave } from "@/lib/leave/server";
import { createClient } from "@/lib/supabase/server";

// Owner home (ui-reference/desktop-owner-home.png): who is out today and in the next 7
// days, approved first, pending marked as such.
export async function WhosOutCard({ calendarHref }: { calendarHref: string }) {
  // Reading the session first makes this request-time, before "today" is computed.
  const supabase = await createClient();
  const t = await getTranslations("Leave.whosOut");
  const locale = await getLocale();
  const today = malaysiaToday();
  const weekOn = new Date(Date.parse(`${today}T00:00:00Z`) + 7 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const leave = await loadTeamLeave(supabase, today, weekOn);
  const rows = [...leave]
    .sort(
      (a, b) =>
        a.start_date.localeCompare(b.start_date) ||
        a.status.localeCompare(b.status),
    )
    .slice(0, 6);
  const when = (start: string, end: string) => {
    if (start <= today && end >= today)
      return end === today
        ? t("today")
        : t("untilDate", {
            date: formatDate(dateFromIso(end), locale, "short"),
          });
    const a = formatDate(dateFromIso(start), locale, "short");
    return start === end
      ? a
      : `${a} – ${formatDate(dateFromIso(end), locale, "short")}`;
  };
  return (
    <Card className="flex flex-col gap-4">
      <CardHeader
        title={t("title")}
        action={
          <Link
            href={calendarHref}
            className="text-label text-primary underline-offset-4 hover:underline"
          >
            {t("calendar")}
          </Link>
        }
      />
      {rows.length === 0 ? (
        <EmptyState message={t("none")} className="py-2" />
      ) : (
        <ul className="flex flex-col gap-4">
          {rows.map((l) => (
            <li key={l.request_id}>
              <PersonRow
                id={l.employee_id}
                name={l.full_name}
                meta={[
                  l.type_name_en
                    ? locale === "ms"
                      ? l.type_name_ms
                      : l.type_name_en
                    : t("onLeave"),
                  when(l.start_date, l.end_date) +
                    (l.status === "pending" ? ` (${t("pending")})` : ""),
                ].join(" · ")}
              />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
