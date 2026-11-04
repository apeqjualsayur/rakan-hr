import { getLocale, getTranslations } from "next-intl/server";
import { SectionTabs } from "@/components/credentials/SectionTabs";
import { requireMember } from "@/lib/auth/member";
import { ADMIN_ROLES, can } from "@/lib/auth/roles";
import { redirect } from "@/i18n/navigation";

// Hiring (Step 8, HIR-01 → HIR-05): candidates by stage, job openings, and each
// candidate's offer and pre-boarding. Owner and HR admin run it; the auditor reads.
export default async function HiringLayout({
  children,
}: LayoutProps<"/[locale]/admin/hiring">) {
  const member = await requireMember(ADMIN_ROLES);
  if (!can(member.role, "viewHiring"))
    redirect({ href: "/admin", locale: await getLocale() });
  const t = await getTranslations("Hiring");
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-display-sm text-ink md:text-display">
          {t("title")}
        </h1>
        <p className="max-w-3xl text-body text-ink-muted">{t("intro")}</p>
      </div>
      <SectionTabs
        label={t("nav.label")}
        items={[
          { href: "/admin/hiring", label: t("nav.pipeline") },
          { href: "/admin/hiring/openings", label: t("nav.openings") },
        ]}
      />
      {children}
    </div>
  );
}
