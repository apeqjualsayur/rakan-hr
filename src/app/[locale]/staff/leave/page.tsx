import { Plus } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { MyRequests } from "@/components/leave/LeaveBits";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/Card";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Link } from "@/i18n/navigation";
import { requireMember } from "@/lib/auth/member";
import { STAFF_ROLES } from "@/lib/auth/roles";
import { dateFromIso, formatDate, malaysiaToday } from "@/lib/format";
import { available, days as fmt, totalAllowance } from "@/lib/leave/logic";
import { loadBalances, loadLeaveTypes } from "@/lib/leave/server";
import { REQUEST_COLUMNS, type LeaveRequest } from "@/lib/leave/types";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export async function generateMetadata() {
  const t = await getTranslations("Leave");
  return { title: t("title") };
}

// LVE-05 for staff: this year's balances, own requests, and Apply. Managers also get the
// link to their team's requests and calendar.
export default async function StaffLeavePage({
  searchParams,
}: PageProps<"/[locale]/staff/leave">) {
  const member = await requireMember(STAFF_ROLES);
  const { applied } = await searchParams;
  const t = await getTranslations("Leave");
  const locale = await getLocale();
  const supabase = await createClient();
  const year = Number(malaysiaToday().slice(0, 4));
  const [types, balances, { data: requests }] = await Promise.all([
    loadLeaveTypes(supabase),
    member.employeeId
      ? loadBalances(supabase, year, member.employeeId)
      : Promise.resolve([]),
    member.employeeId
      ? supabase
          .from("leave_requests")
          .select(REQUEST_COLUMNS)
          .eq("employee_id", member.employeeId)
          .order("start_date", { ascending: false })
          .limit(30)
          .returns<LeaveRequest[]>()
      : Promise.resolve({ data: [] as LeaveRequest[] }),
  ]);
  const name = (id: string) => {
    const x = types.find((y) => y.id === id);
    return x ? (locale === "ms" ? x.name_ms : x.name_en) : "";
  };
  const shown = types
    .map((type) => ({
      type,
      balance: balances.find((b) => b.leave_type_id === type.id),
    }))
    .filter(
      ({ type, balance }) =>
        balance &&
        (Number(balance.entitled ?? 0) > 0 ||
          Number(balance.taken) > 0 ||
          type.code === "ANNUAL"),
    );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-display-sm text-ink">{t("title")}</h1>
        {member.role === "manager" ? (
          <Link
            href="/staff/leave/team"
            className="text-label text-primary underline-offset-4 hover:underline"
          >
            {t("team")}
          </Link>
        ) : null}
      </div>
      {applied === "1" ? (
        <p
          role="status"
          className="rounded-tile bg-primary-tint px-4 py-3 text-meta text-primary-strong"
        >
          {t("applied")}
        </p>
      ) : null}
      {member.employeeId ? (
        <Link
          href="/staff/leave/apply"
          className={cn(buttonVariants({ variant: "accent", block: true }))}
        >
          <Plus aria-hidden />
          {t("applyButton")}
        </Link>
      ) : (
        <p className="text-body text-ink-muted">{t("notLinked")}</p>
      )}
      <div className="grid grid-cols-2 gap-3">
        {shown.map(({ type, balance }) => {
          const left = available(balance!);
          const total = totalAllowance(balance!);
          return (
            <Card key={type.id} className="flex flex-col gap-2 p-4">
              <p className="text-label text-ink-muted">{name(type.id)}</p>
              <p className="text-stat text-ink tabular-nums">
                {left === null ? "—" : fmt(left)}
              </p>
              {total !== null ? (
                <>
                  <ProgressBar value={left ?? 0} max={total || 1} hideLabels />
                  <p className="text-meta text-ink-muted">
                    {t("ofDays", { total: fmt(total) })}
                  </p>
                </>
              ) : null}
              {Number(balance!.carried_forward) -
                Number(balance!.carry_forfeited) >
                0 && balance!.carry_expires_on ? (
                <p className="text-meta text-warning">
                  {t("carried", {
                    days: fmt(
                      Number(balance!.carried_forward) -
                        Number(balance!.carry_forfeited),
                    ),
                    date: formatDate(
                      dateFromIso(balance!.carry_expires_on),
                      locale,
                      "full",
                    ),
                  })}
                </p>
              ) : null}
            </Card>
          );
        })}
      </div>
      <Card className="flex flex-col gap-2">
        <CardHeader title={t("myRequests")} />
        <MyRequests
          requests={requests ?? []}
          typeNames={Object.fromEntries(types.map((x) => [x.id, name(x.id)]))}
        />
      </Card>
    </div>
  );
}
