import { ChevronLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { PendingClaims } from "@/components/claims/PendingClaims";
import { LeaveCalendar } from "@/components/leave/LeaveCalendar";
import { PendingLeave } from "@/components/leave/PendingLeave";
import { PendingOt } from "@/components/time/PendingOt";
import { Card, CardHeader } from "@/components/ui/Card";
import { Link } from "@/i18n/navigation";
import { requireMember } from "@/lib/auth/member";
import { malaysiaToday } from "@/lib/format";
import { parseMonth } from "@/lib/leave/logic";
import { loadHolidays, loadTeamLeave } from "@/lib/leave/server";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata() {
  const t = await getTranslations("Leave");
  return { title: t("team") };
}

// LVE-05 / LVE-06 for managers on their phone: requests to approve and the team calendar.
export default async function TeamLeavePage({
  searchParams,
}: PageProps<"/[locale]/staff/leave/team">) {
  const member = await requireMember(["manager"]);
  const { month } = await searchParams;
  const t = await getTranslations("Leave");
  const today = malaysiaToday();
  const m = parseMonth(month, today);
  const first = `${m.key}-01`;
  const last = new Date(Date.UTC(m.year, m.month, 0))
    .toISOString()
    .slice(0, 10);
  const supabase = await createClient();
  const [leave, holidays] = await Promise.all([
    loadTeamLeave(supabase, first, last),
    loadHolidays(supabase, first, last),
  ]);
  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/staff/leave"
        className="inline-flex min-h-11 w-fit items-center gap-1 text-label text-primary underline-offset-4 hover:underline"
      >
        <ChevronLeft aria-hidden size={20} strokeWidth={1.75} />
        {t("title")}
      </Link>
      <h1 className="text-display-sm text-ink">{t("team")}</h1>
      <Card className="flex flex-col gap-2">
        <CardHeader title={t("toApprove")} />
        <PendingLeave member={member} showCertificates={false} />
      </Card>
      <Card className="flex flex-col gap-2">
        <CardHeader title={t("otToApprove")} />
        <PendingOt member={member} />
      </Card>
      <Card className="flex flex-col gap-2">
        <CardHeader title={t("claimsToApprove")} />
        <PendingClaims member={member} />
      </Card>
      <LeaveCalendar
        monthKey={m.key}
        leave={leave}
        holidays={holidays}
        today={today}
        basePath="/staff/leave/team"
      />
    </div>
  );
}
