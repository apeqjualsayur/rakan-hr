import { getTranslations } from "next-intl/server";
import { SectionTabs } from "@/components/credentials/SectionTabs";
import { requireMember } from "@/lib/auth/member";
import { can } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";

// Compliance (Step 6 part of the Compliance Centre): the credential matrix, the
// verification queue and CPD to verify. Step 15 adds the rest of the Compliance Centre.
export default async function ComplianceLayout({
  children,
}: LayoutProps<"/[locale]/admin/compliance">) {
  const member = await requireMember(["owner", "hr_admin", "auditor"]);
  const t = await getTranslations("Compliance");
  const reviewer = can(member.role, "reviewChanges");

  let waiting = 0;
  let cpdWaiting = 0;
  if (reviewer) {
    const supabase = await createClient();
    const [credentials, cpd] = await Promise.all([
      supabase
        .from("staff_credentials")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending"),
      supabase
        .from("cpd_activities")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending"),
    ]);
    waiting = credentials.count ?? 0;
    cpdWaiting = cpd.count ?? 0;
  }

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
          { href: "/admin/compliance", label: t("nav.matrix") },
          { href: "/admin/compliance/policies", label: t("nav.policies") },
          ...(reviewer
            ? [
                {
                  href: "/admin/compliance/verify",
                  label: t("nav.verify"),
                  count: waiting,
                },
                {
                  href: "/admin/compliance/cpd",
                  label: t("nav.cpd"),
                  count: cpdWaiting,
                },
              ]
            : []),
        ]}
      />
      {children}
    </div>
  );
}
