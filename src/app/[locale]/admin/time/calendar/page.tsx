import { getTranslations } from "next-intl/server";
import { LeaveCalendar } from "@/components/leave/LeaveCalendar";
import { requireMember } from "@/lib/auth/member";
import { ADMIN_ROLES } from "@/lib/auth/roles";
import { malaysiaToday } from "@/lib/format";
import { parseMonth } from "@/lib/leave/logic";
import { loadHolidays, loadTeamLeave } from "@/lib/leave/server";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata() {
  const t = await getTranslations("Leave.nav");
  return { title: t("calendar") };
}

// LVE-06 team calendar. Roster clashes join in Step 10 (clinical roster).
export default async function LeaveCalendarPage({
  searchParams,
}: PageProps<"/[locale]/admin/time/calendar">) {
  await requireMember(ADMIN_ROLES);
  const { month } = await searchParams;
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
    <LeaveCalendar
      monthKey={m.key}
      leave={leave}
      holidays={holidays}
      today={today}
      basePath="/admin/time/calendar"
    />
  );
}
