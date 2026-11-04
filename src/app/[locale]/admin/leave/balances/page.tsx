import { getLocale, getTranslations } from "next-intl/server";
import { LeaveApplyForm } from "@/components/leave/LeaveApplyForm";
import { Card, CardHeader } from "@/components/ui/Card";
import { requireMember } from "@/lib/auth/member";
import { ADMIN_ROLES, can } from "@/lib/auth/roles";
import { malaysiaToday } from "@/lib/format";
import { available, days as fmt, totalAllowance } from "@/lib/leave/logic";
import { loadBalances, loadLeaveTypes } from "@/lib/leave/server";
import { createClient } from "@/lib/supabase/server";
import { AdjustForm } from "./AdjustForm";

export async function generateMetadata() {
  const t = await getTranslations("Leave.nav");
  return { title: t("balances") };
}

// Everyone's balances this year (left of the total), HR adjustments with a reason, and
// leave recorded by HR for someone (approved straight away; may override the balance).
export default async function LeaveBalancesPage() {
  const member = await requireMember(ADMIN_ROLES);
  const t = await getTranslations("Leave.balances");
  const locale = await getLocale();
  const supabase = await createClient();
  const year = Number(malaysiaToday().slice(0, 4));
  const [types, balances, { data: people }] = await Promise.all([
    loadLeaveTypes(supabase),
    loadBalances(supabase, year),
    supabase
      .from("employees")
      .select("id, full_name, employee_no")
      .in("status", ["active", "on_notice"])
      .is("deleted_at", null)
      .order("full_name"),
  ]);
  const columns = types.filter((x) =>
    ["ANNUAL", "SICK", "HOSPITALISATION", "REPLACEMENT", "UNPAID"].includes(
      x.code,
    ),
  );
  const name = (x: (typeof types)[number]) =>
    locale === "ms" ? x.name_ms : x.name_en;
  const editor = can(member.role, "editPeople");
  const list = (people ?? []) as {
    id: string;
    full_name: string;
    employee_no: string;
  }[];

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-col gap-3 overflow-x-auto">
        <CardHeader title={t("title", { year })} />
        <table className="w-full min-w-[720px] text-left">
          <thead>
            <tr className="border-b border-border text-label text-ink-muted">
              <th className="py-2 pr-4 font-medium">{t("person")}</th>
              {columns.map((c) => (
                <th key={c.id} className="py-2 pr-4 font-medium">
                  {name(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {list.map((p) => (
              <tr key={p.id} className="text-body text-ink">
                <td className="py-3 pr-4">
                  <span className="flex flex-col">
                    {p.full_name}
                    <span className="text-meta text-ink-muted">
                      {p.employee_no}
                    </span>
                  </span>
                </td>
                {columns.map((c) => {
                  const b = balances.find(
                    (x) => x.employee_id === p.id && x.leave_type_id === c.id,
                  );
                  const left = b ? available(b) : null;
                  const total = b ? totalAllowance(b) : null;
                  return (
                    <td key={c.id} className="py-3 pr-4 tabular-nums">
                      {!b
                        ? "—"
                        : c.unlimited
                          ? t("taken", { days: fmt(b.taken) })
                          : `${fmt(left)} / ${fmt(total)}`}
                      {left !== null && left < 0 ? (
                        <span className="ml-1 text-meta text-danger">
                          {t("negative")}
                        </span>
                      ) : null}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-meta text-ink-muted">{t("legend")}</p>
      </Card>
      {editor ? (
        <div className="grid items-start gap-6 lg:grid-cols-2">
          <section className="flex flex-col gap-3">
            <h2 className="text-h2 text-ink">{t("recordTitle")}</h2>
            <p className="text-meta text-ink-muted">{t("recordIntro")}</p>
            <LeaveApplyForm
              types={types}
              available={{}}
              tenantId={member.tenantId!}
              employeeId={null}
              people={list}
              admin
            />
          </section>
          <section className="flex flex-col gap-3">
            <h2 className="text-h2 text-ink">{t("adjustTitle")}</h2>
            <p className="text-meta text-ink-muted">{t("adjustIntro")}</p>
            <AdjustForm
              people={list}
              types={types
                .filter((x) => !x.unlimited)
                .map((x) => ({ id: x.id, name: name(x) }))}
              year={year}
            />
          </section>
        </div>
      ) : null}
    </div>
  );
}
