import { getLocale, getTranslations } from "next-intl/server";
import { Card, CardHeader } from "@/components/ui/Card";
import { Link } from "@/i18n/navigation";
import { requireMember } from "@/lib/auth/member";
import { can } from "@/lib/auth/roles";
import { dateFromIso, formatDate, malaysiaToday } from "@/lib/format";
import { loadHolidays } from "@/lib/leave/server";
import { stateName } from "@/lib/malaysia";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { HolidayForm, RemoveHolidayButton } from "./HolidayForm";

export async function generateMetadata() {
  const t = await getTranslations("Settings.nav");
  return { title: t("holidays") };
}

// LVE-04 Settings > Public holidays: the company's state + nationwide holidays for a year,
// replacement days worked out from the rest day, and the company's own extra holidays.
export default async function HolidaysPage({
  searchParams,
}: PageProps<"/[locale]/admin/settings/holidays">) {
  const member = await requireMember([
    "owner",
    "hr_admin",
    "payroll_approver",
    "auditor",
  ]);
  const { year: yearParam } = await searchParams;
  const t = await getTranslations("Leave.holidays");
  const locale = await getLocale();
  const thisYear = Number(malaysiaToday().slice(0, 4));
  const year =
    typeof yearParam === "string" && /^20\d\d$/.test(yearParam)
      ? Number(yearParam)
      : thisYear;
  const supabase = await createClient();
  const [holidays, { data: tenant }, { data: own }] = await Promise.all([
    loadHolidays(supabase, `${year}-01-01`, `${year}-12-31`),
    supabase
      .from("tenants")
      .select("state_code, rest_day")
      .eq("id", member.tenantId!)
      .maybeSingle(),
    supabase
      .from("public_holidays")
      .select("id, holiday_date, name_en")
      .not("tenant_id", "is", null)
      .gte("holiday_date", `${year}-01-01`)
      .lte("holiday_date", `${year}-12-31`),
  ]);
  const editor = can(member.role, "editPeople");
  const restDay = new Intl.DateTimeFormat(locale === "ms" ? "ms-MY" : "en-GB", {
    weekday: "long",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(2026, 10, 1 + Number(tenant?.rest_day ?? 0))));

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-3xl text-body text-ink-muted">
        {t("intro", {
          state: stateName(tenant?.state_code as string | null) ?? t("noState"),
          restDay,
        })}
      </p>
      <div className="flex gap-2">
        {[thisYear, thisYear + 1].map((y) => (
          <Link
            key={y}
            href={`/admin/settings/holidays?year=${y}`}
            aria-current={y === year ? "page" : undefined}
            className={cn(
              "flex min-h-11 items-center rounded-full border px-4 text-label",
              y === year
                ? "border-transparent bg-primary-tint text-primary"
                : "border-border bg-surface text-ink-soft",
            )}
          >
            {y}
          </Link>
        ))}
      </div>
      {holidays.some((h) => h.is_provisional) ? (
        <p className="max-w-3xl rounded-tile bg-warning-tint px-4 py-3 text-meta text-warning">
          {t("provisionalNote")}
        </p>
      ) : null}
      <Card className="flex flex-col gap-2">
        <CardHeader title={t("title", { year })} />
        <ul className="flex flex-col divide-y divide-border">
          {holidays.map((h) => {
            const mine =
              h.is_company && !h.is_replacement
                ? (own ?? []).find(
                    (o) =>
                      o.holiday_date === h.holiday_date &&
                      o.name_en === h.name_en,
                  )
                : null;
            return (
              <li
                key={`${h.holiday_date}-${h.name_en}`}
                className="flex flex-wrap items-center gap-3 py-3"
              >
                <span className="w-36 shrink-0 text-body text-ink tabular-nums">
                  {formatDate(
                    dateFromIso(h.holiday_date),
                    locale,
                    "weekdayShort",
                  )}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span
                    className={cn(
                      "text-body",
                      h.is_replacement ? "text-ink-soft" : "text-ink",
                    )}
                  >
                    {locale === "ms" ? h.name_ms : h.name_en}
                  </span>
                  {h.is_replacement && h.replaces ? (
                    <span className="text-meta text-ink-muted">
                      {t("replaces", {
                        date: formatDate(
                          dateFromIso(h.replaces),
                          locale,
                          "weekdayShort",
                        ),
                      })}
                    </span>
                  ) : null}
                </span>
                {h.is_provisional ? (
                  <span className="rounded-full bg-warning-tint px-3 py-0.5 text-label text-warning">
                    {t("provisional")}
                  </span>
                ) : null}
                {h.is_company ? (
                  <span className="rounded-full bg-neutral-tint px-3 py-0.5 text-label text-neutral">
                    {t("company")}
                  </span>
                ) : null}
                {mine && editor ? (
                  <RemoveHolidayButton id={mine.id as string} />
                ) : null}
              </li>
            );
          })}
        </ul>
      </Card>
      {editor ? <HolidayForm /> : null}
    </div>
  );
}
