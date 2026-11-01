import { Suspense } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { AuthLoading } from "@/components/layout/AuthLayout";
import { redirect } from "@/i18n/navigation";
import { requireMember } from "@/lib/auth/member";
import { homeFor } from "@/lib/auth/roles";

// Entry point: login → MFA (owner / HR / payroll approver) → the member's home by role.
export default async function LandingPage() {
  const t = await getTranslations("Auth");
  return (
    <Suspense fallback={<AuthLoading label={t("loading")} />}>
      <RouteByRole />
    </Suspense>
  );
}

async function RouteByRole() {
  const member = await requireMember();
  redirect({ href: homeFor(member.role), locale: await getLocale() });
  return null;
}
