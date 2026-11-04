import { getLocale, getTranslations } from "next-intl/server";
import { OtForm } from "@/components/time/OtBits";
import { OtLines } from "@/components/time/OtLines";
import { PendingOt } from "@/components/time/PendingOt";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { requireMember } from "@/lib/auth/member";
import { ADMIN_ROLES, can } from "@/lib/auth/roles";
import {
  dateFromIso,
  formatDate,
  formatMoney,
  malaysiaToday,
} from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { OT_COLUMNS, type OtRequest } from "@/lib/time/types";

export async function generateMetadata() {
  const t = await getTranslations("Time.nav");
  return { title: t("overtime") };
}

// ATT-04 / ATT-05: OT to decide, this month's approved OT with how it was calculated
// (payroll-rules.md §5), hours per person against the monthly limit, and HR recording OT.
export default async function OvertimePage() {
  const member = await requireMember(ADMIN_ROLES);
  const t = await getTranslations("Time.ot");
  const locale = await getLocale();
  const supabase = await createClient();
  const today = malaysiaToday();
  const monthStart = `${today.slice(0, 7)}-01`;
  const nextMonth = new Date(
    Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 1),
  )
    .toISOString()
    .slice(0, 10);
  const [{ data }, { data: people }, { data: params }] = await Promise.all([
    supabase
      .from("ot_requests")
      .select(`${OT_COLUMNS}, employees (full_name)`)
      .eq("status", "approved")
      .gte("work_date", monthStart)
      .lt("work_date", nextMonth)
      .order("work_date"),
    supabase
      .from("employees")
      .select("id, full_name")
      .in("status", ["active", "on_notice"])
      .is("deleted_at", null)
      .order("full_name"),
    supabase.rpc("ea_parameters", { p_on: today }),
  ]);
  const approved = (data ?? []) as unknown as (OtRequest & {
    employees: { full_name: string } | null;
  })[];
  const limit = Number(
    (params as { ot_monthly_limit_hours?: string } | null)
      ?.ot_monthly_limit_hours ?? 104,
  );
  const perPerson = new Map<
    string,
    { name: string; hours: number; amount: number }
  >();
  for (const r of approved) {
    if (r.work_date.slice(0, 7) !== today.slice(0, 7)) continue;
    const cur = perPerson.get(r.employee_id) ?? {
      name: r.employees?.full_name ?? "",
      hours: 0,
      amount: 0,
    };
    perPerson.set(r.employee_id, {
      ...cur,
      hours: cur.hours + Number(r.hours),
      amount: cur.amount + Number(r.calculated_amount ?? 0),
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-col gap-2">
        <CardHeader title={t("toApprove")} />
        <PendingOt member={member} />
      </Card>
      <Card className="flex flex-col gap-3">
        <CardHeader
          title={t("thisMonth", {
            month: formatDate(dateFromIso(monthStart), locale, "long").replace(
              /^[^,]*,\s*\d+\s*/,
              "",
            ),
          })}
        />
        {perPerson.size ? (
          <ul className="flex flex-wrap gap-2">
            {[...perPerson.values()].map((p) => (
              <li
                key={p.name}
                className={
                  p.hours > limit
                    ? "rounded-full bg-warning-tint px-3 py-1 text-meta text-warning"
                    : "rounded-full bg-neutral-tint px-3 py-1 text-meta text-neutral"
                }
              >
                {t("personMonth", {
                  name: p.name,
                  hours: String(p.hours),
                  limit: String(limit),
                  amount: formatMoney(p.amount),
                })}
              </li>
            ))}
          </ul>
        ) : null}
        {approved.length === 0 ? (
          <EmptyState message={t("noneApproved")} />
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {approved.map((r) => (
              <li
                key={r.id}
                className="flex flex-col gap-1 py-3 md:flex-row md:items-start md:justify-between"
              >
                <span className="flex flex-col">
                  <span className="text-body font-medium text-ink">
                    {r.employees?.full_name} ·{" "}
                    {formatDate(
                      dateFromIso(r.work_date),
                      locale,
                      "weekdayShort",
                    )}{" "}
                    · {t(`dayTypes.${r.day_type}`)} ·{" "}
                    {t("hoursCount", { hours: Number(r.hours) })}
                  </span>
                  <OtLines calc={r.calculation} />
                </span>
                <span className="text-h3 text-ink tabular-nums">
                  {r.calculated_amount !== null
                    ? formatMoney(r.calculated_amount)
                    : "–"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {can(member.role, "editPeople") ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-h2 text-ink">{t("recordTitle")}</h2>
          <p className="text-meta text-ink-muted">{t("recordIntro")}</p>
          <OtForm
            people={(people ?? []) as { id: string; full_name: string }[]}
          />
        </section>
      ) : null}
    </div>
  );
}
