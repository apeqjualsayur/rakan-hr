import { Suspense, type ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { AuthLoading } from "@/components/layout/AuthLayout";
import { NotificationBell } from "@/components/layout/NotificationBell";
import { SignOutButton } from "@/components/layout/SignOutButton";
import { StaffShell } from "@/components/layout/StaffShell";
import { requireMember } from "@/lib/auth/member";
import { STAFF_ROLES } from "@/lib/auth/roles";

// Mobile shell for managers and staff.
export default async function StaffLayout({
  children,
}: LayoutProps<"/[locale]/staff">) {
  const t = await getTranslations("Auth");
  return (
    <Suspense fallback={<AuthLoading label={t("loading")} />}>
      <StaffGate>{children}</StaffGate>
    </Suspense>
  );
}

async function StaffGate({ children }: { children: ReactNode }) {
  await requireMember(STAFF_ROLES);
  return (
    <StaffShell
      actions={
        <>
          <NotificationBell />
          <SignOutButton compact />
        </>
      }
    >
      {children}
    </StaffShell>
  );
}
