import { getTranslations } from "next-intl/server";
import { SectionTabs } from "@/components/credentials/SectionTabs";
import { requireMember } from "@/lib/auth/member";
import { STAFF_ROLES } from "@/lib/auth/roles";

// Staff credentials (Step 6): My Credentials, CPD, and for managers their team's status.
export default async function StaffCredentialsLayout({
  children,
}: LayoutProps<"/[locale]/staff/credentials">) {
  const member = await requireMember(STAFF_ROLES);
  const t = await getTranslations("Credentials.tabs");
  return (
    <div className="flex flex-col gap-4">
      <SectionTabs
        label={t("label")}
        items={[
          { href: "/staff/credentials", label: t("mine") },
          { href: "/staff/credentials/cpd", label: t("cpd") },
          ...(member.role === "manager"
            ? [{ href: "/staff/credentials/team", label: t("team") }]
            : []),
        ]}
      />
      {children}
    </div>
  );
}
