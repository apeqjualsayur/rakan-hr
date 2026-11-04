import { getTranslations } from "next-intl/server";
import {
  AnnouncementsCard,
  PoliciesBanner,
} from "@/components/policies/HomeCards";
import { WhosOutCard } from "@/components/leave/WhosOutCard";
import { SetupProgressCard } from "@/components/settings/SetupProgressCard";
import { TestNotificationButton } from "./TestNotificationButton";

// Admin / Owner home. Step 16 builds the full reference screen; until then it shows the
// Employer Setup Checklist progress (ORG-04) beside the placeholder.
export default async function AdminHomePage() {
  const t = await getTranslations("Placeholder");
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col gap-6">
        <PoliciesBanner area="/admin" />
        <section className="flex flex-col gap-6 rounded-card border border-border bg-surface p-6">
          <div>
            <h1 className="text-[40px] leading-[48px] font-bold tracking-tight">
              {t("adminTitle")}
            </h1>
            <p className="mt-2 text-ink-muted">{t("body")}</p>
          </div>
          {process.env.NODE_ENV !== "production" ? (
            <TestNotificationButton />
          ) : null}
        </section>
      </div>
      <div className="flex min-w-0 flex-col gap-6">
        <WhosOutCard calendarHref="/admin/time/calendar" />
        <SetupProgressCard />
        <AnnouncementsCard area="/admin" />
      </div>
    </div>
  );
}
