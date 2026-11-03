import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { AuthLoading } from "@/components/layout/AuthLayout";
import { LanguageToggle } from "@/components/layout/LanguageToggle";
import { Logo } from "@/components/layout/Logo";
import { SignOutButton } from "@/components/layout/SignOutButton";
import { PolicySignView } from "@/components/policies/PolicySignView";
import { redirect } from "@/i18n/navigation";
import { requireMember } from "@/lib/auth/member";
import { homeFor } from "@/lib/auth/roles";
import { getLocale } from "next-intl/server";

export async function generateMetadata() {
  const t = await getTranslations("Policies.privacy");
  return { title: t("title") };
}

// CMP-05: everyone signs the current PDPA notice before using Rakan. requireMember() sends
// people here while it is unsigned; once signed they go to their home screen.
export default async function PrivacyNoticePage() {
  const t = await getTranslations("Auth");
  return (
    <Suspense fallback={<AuthLoading label={t("loading")} />}>
      <PrivacyGate />
    </Suspense>
  );
}

async function PrivacyGate() {
  const member = await requireMember(undefined, { privacyNoticePage: true });
  const t = await getTranslations("Policies.privacy");
  const home = homeFor(member.role);
  if (!member.pendingPrivacyNoticeId) {
    redirect({ href: home, locale: await getLocale() });
  }
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6 md:py-10">
      <div className="flex items-center justify-between gap-3">
        <Logo href={home} />
        <div className="flex items-center gap-2">
          <LanguageToggle />
          <SignOutButton compact />
        </div>
      </div>
      <p className="rounded-tile bg-warning-tint px-4 py-3 text-body text-warning">
        {t("intro")}
      </p>
      <PolicySignView
        member={member}
        policyId={member.pendingPrivacyNoticeId!}
        doneHref={home}
      />
    </div>
  );
}
