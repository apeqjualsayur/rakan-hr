import { CalendarDays, Clock, FileText, Receipt } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import {
  AnnouncementsCard,
  PoliciesBanner,
} from "@/components/policies/HomeCards";
import { TodayCard } from "@/components/time/TodayCard";
import { Card } from "@/components/ui/Card";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { QuickActionTile } from "@/components/ui/QuickActionTile";
import { getCurrentMember } from "@/lib/auth/member";
import { formatDate, malaysiaToday } from "@/lib/format";
import { available, days as fmt, totalAllowance } from "@/lib/leave/logic";
import { createClient } from "@/lib/supabase/server";
import type { Today } from "@/lib/time/types";
import type { LeaveBalance } from "@/lib/leave/types";

// Staff home (ui-reference/mobile-staff-home.png): today's shift with Clock in (Step 10),
// quick actions, policies to sign, annual leave left and the latest announcements. Step 16
// finishes the screen (credentials banner, latest payslip).
export default async function StaffHomePage() {
  const member = await getCurrentMember();
  const t = await getTranslations("StaffHome");
  const tg = await getTranslations("Greeting");
  const locale = await getLocale();
  const supabase = await createClient();
  const today = malaysiaToday();
  const [{ data: day }, { data: me }, { data: annual }] = await Promise.all([
    member.employeeId
      ? supabase.rpc("my_today")
      : Promise.resolve({ data: null }),
    member.employeeId
      ? supabase
          .from("employees")
          .select("full_name")
          .eq("id", member.employeeId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    member.employeeId
      ? supabase
          .from("leave_balances")
          .select("*, leave_types!inner (code)")
          .eq("employee_id", member.employeeId)
          .eq("year", Number(today.slice(0, 4)))
          .eq("leave_types.code", "ANNUAL")
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const firstName = String(me?.full_name ?? "").split(" ")[0];
  const balance = annual as LeaveBalance | null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col">
        <p className="text-meta text-ink-muted">
          {formatDate(new Date(), locale, "longNoYear")}
        </p>
        <h1 className="text-display-sm text-ink">
          {firstName ? tg("hi", { name: firstName }) : t("fallbackTitle")}
        </h1>
      </div>
      {member.employeeId && day ? (
        <TodayCard
          today={day as Today}
          tenantId={member.tenantId!}
          employeeId={member.employeeId}
        />
      ) : null}
      <div className="grid grid-cols-4 gap-2">
        <QuickActionTile
          icon={CalendarDays}
          label={t("tiles.leave")}
          href="/staff/leave/apply"
        />
        <QuickActionTile icon={Receipt} label={t("tiles.claim")} disabled />
        <QuickActionTile
          icon={Clock}
          label={t("tiles.overtime")}
          href="/staff/time#overtime"
        />
        <QuickActionTile icon={FileText} label={t("tiles.payslips")} disabled />
      </div>
      <PoliciesBanner area="/staff" />
      {balance ? (
        <Card className="flex flex-col gap-2 p-5">
          <p className="text-label text-ink-muted">{t("annualLeave")}</p>
          <p className="text-ink">
            <span className="text-stat tabular-nums">
              {fmt(available(balance))}
            </span>{" "}
            <span className="text-h3 text-ink-muted">
              {t("ofDays", { total: fmt(totalAllowance(balance)) })}
            </span>
          </p>
          <ProgressBar
            value={available(balance) ?? 0}
            max={totalAllowance(balance) || 1}
            hideLabels
          />
        </Card>
      ) : null}
      <AnnouncementsCard area="/staff" />
    </div>
  );
}
