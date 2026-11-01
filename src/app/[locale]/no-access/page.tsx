import { Suspense } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { AuthLayout, AuthLoading } from "@/components/layout/AuthLayout";
import { SignOutButton } from "@/components/layout/SignOutButton";
import { redirect } from "@/i18n/navigation";
import { getCurrentMember } from "@/lib/auth/member";

// Signed in, but no active membership (not invited yet, or deactivated).
export default async function NoAccessPage() {
  const t = await getTranslations("Auth");
  return (
    <Suspense fallback={<AuthLoading label={t("loading")} />}>
      <NoAccess />
    </Suspense>
  );
}

async function NoAccess() {
  const [t, member, locale] = await Promise.all([
    getTranslations("Auth"),
    getCurrentMember(),
    getLocale(),
  ]);
  if (!member.signedIn) redirect({ href: "/login", locale });
  if (member.role) redirect({ href: "/", locale });

  return (
    <AuthLayout
      title={t("noAccessTitle")}
      intro={t("noAccessBody", { email: member.email ?? "" })}
    >
      <SignOutButton />
    </AuthLayout>
  );
}
