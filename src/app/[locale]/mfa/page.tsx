import { Suspense } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { AuthLayout, AuthLoading } from "@/components/layout/AuthLayout";
import { SignOutButton } from "@/components/layout/SignOutButton";
import { redirect } from "@/i18n/navigation";
import { getCurrentMember } from "@/lib/auth/member";
import { guardRedirect, homeFor, needsMfa } from "@/lib/auth/roles";
import { MfaForm } from "./MfaForm";

// Forced for owner / HR admin / payroll approver until the session reaches aal2.
export default async function MfaPage() {
  const t = await getTranslations("Auth");
  return (
    <Suspense fallback={<AuthLoading label={t("loading")} />}>
      <Mfa />
    </Suspense>
  );
}

async function Mfa() {
  const [t, member, locale] = await Promise.all([
    getTranslations("Auth"),
    getCurrentMember(),
    getLocale(),
  ]);
  if (!member.signedIn || !member.role) {
    redirect({ href: guardRedirect(member) ?? "/login", locale });
  }
  if (!needsMfa(member)) redirect({ href: homeFor(member.role!), locale });

  const mode = member.hasMfaFactor ? "verify" : "setup";
  return (
    <AuthLayout
      title={mode === "setup" ? t("mfaSetupTitle") : t("mfaVerifyTitle")}
      intro={mode === "setup" ? t("mfaSetupIntro") : t("mfaVerifyIntro")}
    >
      <MfaForm mode={mode} />
      <SignOutButton />
    </AuthLayout>
  );
}
