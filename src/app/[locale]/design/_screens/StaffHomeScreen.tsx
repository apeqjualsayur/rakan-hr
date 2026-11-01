import { Bell, CalendarDays, Clock, FileText, ReceiptText } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { AttentionBanner } from "@/components/ui/AttentionBanner";
import { PersonAvatar } from "@/components/ui/PersonRow";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { QuickActionTile } from "@/components/ui/QuickActionTile";
import { ShiftHeroCard } from "@/components/ui/ShiftHeroCard";
import { StatCard } from "@/components/ui/StatCard";
import { formatDate, formatMoney, formatTime } from "@/lib/format";
import type { GeofenceState } from "@/components/ui/LocationPill";
import { DEMO_NOW, DEMO_SHIFT, demoPeople } from "./demo-data";

// Recreation of ui-reference/mobile-staff-home.png, with fixes §6.2 (time on one
// line) and §6.3 (geofence-aware location pill). The single accent is Clock in.
export function StaffHomeScreen({
  geofence = "inside",
}: {
  geofence?: GeofenceState;
}) {
  const locale = useLocale();
  const t = useTranslations("Demo");
  const tg = useTranslations("Greeting");
  const tn = useTranslations("AdminNav");

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-body text-ink-muted">
            {formatDate(DEMO_NOW, locale, "longNoYear")}
          </p>
          <h1 className="text-display-sm text-ink">
            {tg("hi", { name: t("staff.name") })}
          </h1>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <button
            type="button"
            aria-label={tn("notificationsUnread")}
            className="relative grid size-12 place-items-center rounded-full border border-border bg-surface text-ink-soft"
          >
            <Bell aria-hidden size={22} strokeWidth={1.75} />
            <span
              aria-hidden
              className="absolute top-2.5 right-3 size-2.5 rounded-full bg-accent ring-2 ring-surface"
            />
          </button>
          <PersonAvatar {...demoPeople.aina} className="size-14" />
        </div>
      </header>

      <ShiftHeroCard
        timeRange={`${formatTime(DEMO_SHIFT.start, locale)} – ${formatTime(DEMO_SHIFT.end, locale)}`}
        detail={t("staff.detail")}
        geofence={geofence}
      />

      <div className="grid grid-cols-4 gap-2 min-[380px]:gap-3">
        <QuickActionTile
          icon={CalendarDays}
          label={t("staff.leave")}
          href="/design/staff-home"
        />
        <QuickActionTile
          icon={ReceiptText}
          label={t("staff.claim")}
          href="/design/staff-home"
        />
        <QuickActionTile
          icon={Clock}
          label={t("staff.overtime")}
          href="/design/staff-home"
        />
        <QuickActionTile
          icon={FileText}
          label={t("staff.payslips")}
          href="/design/staff-home"
        />
      </div>

      <AttentionBanner
        href="/design/my-credentials"
        title={t("staff.bannerTitle", { count: 2 })}
        meta={t("staff.bannerMeta")}
      />

      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label={t("staff.annualLeave")}
          value="5"
          unit={t("staff.ofDays", { total: 8 })}
          footer={
            <ProgressBar
              value={5}
              max={8}
              valueLabel={`5 ${t("staff.ofDays", { total: 8 })}`}
              hideLabels
            />
          }
        />
        <StatCard
          label={t("staff.latestPayslip")}
          value={formatMoney(3354.65)}
          footer={t("staff.payslipMeta")}
        />
      </div>
    </div>
  );
}
