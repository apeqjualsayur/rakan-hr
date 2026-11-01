import { Suspense, type ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { AccountMenu } from "@/components/layout/AccountMenu";
import { AdminShell } from "@/components/layout/AdminShell";
import { AuthLoading } from "@/components/layout/AuthLayout";
import { NotificationBell } from "@/components/layout/NotificationBell";
import { requireMember } from "@/lib/auth/member";
import { ADMIN_ROLES } from "@/lib/auth/roles";

// Desktop shell for owner, HR admin, payroll approver and auditor (after MFA where required).
export default async function AdminLayout({
  children,
}: LayoutProps<"/[locale]/admin">) {
  const t = await getTranslations("Auth");
  return (
    <Suspense fallback={<AuthLoading label={t("loading")} />}>
      <AdminGate>{children}</AdminGate>
    </Suspense>
  );
}

async function AdminGate({ children }: { children: ReactNode }) {
  const member = await requireMember(ADMIN_ROLES);
  const name = member.email ?? "";
  return (
    <AdminShell
      bell={<NotificationBell />}
      account={<AccountMenu user={{ id: member.userId ?? name, name }} />}
    >
      {children}
    </AdminShell>
  );
}
