import { getTranslations } from "next-intl/server";
import { SectionTabs } from "@/components/credentials/SectionTabs";
import { requireMember } from "@/lib/auth/member";
import { ADMIN_ROLES } from "@/lib/auth/roles";

// Time off (Step 9, LVE-01 → LVE-06): requests waiting for a decision, the team calendar
// with holidays and clashes, and everyone's balances.
export default async function LeaveLayout({
  children,
}: LayoutProps<"/[locale]/admin/leave">) {
  await requireMember(ADMIN_ROLES);
  const t = await getTranslations("Leave");
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-display-sm text-ink md:text-display">
          {t("adminTitle")}
        </h1>
        <p className="max-w-3xl text-body text-ink-muted">{t("adminIntro")}</p>
      </div>
      <SectionTabs
        label={t("nav.label")}
        items={[
          { href: "/admin/leave", label: t("nav.requests") },
          { href: "/admin/leave/calendar", label: t("nav.calendar") },
          { href: "/admin/leave/balances", label: t("nav.balances") },
        ]}
      />
      {children}
    </div>
  );
}
