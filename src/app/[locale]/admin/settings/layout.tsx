import { getTranslations } from "next-intl/server";
import { requireMember } from "@/lib/auth/member";
import { ADMIN_ROLES, can } from "@/lib/auth/roles";
import { SettingsNav } from "./SettingsNav";

// Settings (Step 4, ORG-01 → ORG-04): company, branches, users, setup checklist.
// The admin layout above already guards sign-in, MFA and admin roles.
export default async function SettingsLayout({
  children,
}: LayoutProps<"/[locale]/admin/settings">) {
  const member = await requireMember(ADMIN_ROLES);
  const t = await getTranslations("Settings");
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-display-sm text-ink md:text-display">
          {t("title")}
        </h1>
        <p className="max-w-3xl text-body text-ink-muted">{t("intro")}</p>
      </div>
      <SettingsNav
        sections={[
          "company",
          ...(can(member.role, "viewCompanyBank")
            ? (["bankAccounts"] as const)
            : []),
          "branches",
          ...(can(member.role, "viewUsers") ? (["users"] as const) : []),
          ...(can(member.role, "viewChecklist")
            ? (["checklist"] as const)
            : []),
          "credentials",
          "leave",
          "holidays",
          "claims",
          ...(can(member.role, "viewHiring") ? (["letters"] as const) : []),
        ]}
      />
      {children}
    </div>
  );
}
