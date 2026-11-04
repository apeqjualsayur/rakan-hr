import { Suspense } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { AuthLoading } from "@/components/layout/AuthLayout";
import { LanguageToggle } from "@/components/layout/LanguageToggle";
import { Logo } from "@/components/layout/Logo";
import { SignDocument } from "@/components/policies/SignDocument";
import { Card, CardHeader } from "@/components/ui/Card";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { dateFromIso, formatDate } from "@/lib/format";
import { PREBOARDING_STEPS, preboardingProgress } from "@/lib/hiring/logic";
import { loadPreboarding } from "@/lib/hiring/preboarding";
import {
  acceptOffer,
  preboardingOfferUrl,
} from "@/lib/hiring/preboarding-actions";
import { OfferCopyButton } from "./OfferCopyButton";
import {
  BankSection,
  CredentialsSection,
  DependentsSection,
  FinishSection,
  PersonalSection,
  StatutorySection,
} from "./PortalSections";

export async function generateMetadata() {
  const t = await getTranslations("Preboarding");
  return { title: t("title") };
}

// HIR-04 pre-boarding portal: no Rakan account, just the session from the emailed link.
// 1. Read and accept the offer and contract (click-to-sign, HIR-08).
// 2. Personal, statutory, bank, emergency contact, dependents and credential uploads.
export default async function PreboardingPage() {
  const t = await getTranslations("Auth");
  return (
    <Suspense fallback={<AuthLoading label={t("loading")} />}>
      <Portal />
    </Suspense>
  );
}

async function Portal() {
  const t = await getTranslations("Preboarding");
  const locale = await getLocale();
  const ctx = await loadPreboarding();

  const shell = (children: React.ReactNode) => (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 pt-[max(env(safe-area-inset-top),12px)] pb-12">
      <header className="flex items-center justify-between py-3">
        <Logo href="/preboarding" />
        <LanguageToggle />
      </header>
      {children}
    </div>
  );

  if (typeof ctx === "string")
    return shell(
      <Card className="flex flex-col gap-2">
        <h1 className="text-h2 text-ink">
          {ctx === "no_session" ? t("noSessionTitle") : t("endedTitle")}
        </h1>
        <p className="text-body text-ink-muted">
          {ctx === "no_session" ? t("noSessionBody") : t("endedBody")}
        </p>
      </Card>,
    );

  const done = preboardingProgress(ctx);
  const doneCount = PREBOARDING_STEPS.filter(
    (s) => s !== "dependents" && done[s],
  ).length;
  const total = PREBOARDING_STEPS.length - 1;
  const offer = ctx.offer;
  const company = ctx.company.name ?? ctx.company.legal_name ?? "";
  const accepted = offer?.status === "accepted" && Boolean(ctx.employee);

  return shell(
    <>
      <div className="flex flex-col gap-2 py-2">
        <h1 className="text-display-sm text-ink">
          {t("welcome", { name: ctx.candidate.full_name })}
        </h1>
        {offer ? (
          <p className="text-body text-ink-muted">
            {t(company ? "summary" : "summaryNoCompany", {
              title: offer.job_title,
              company,
              date: formatDate(dateFromIso(offer.start_date), locale, "full"),
            })}
          </p>
        ) : null}
        <ProgressBar
          value={doneCount}
          max={total}
          label={t("progressLabel")}
          valueLabel={t("progress", { done: doneCount, total })}
          className="mt-2"
        />
      </div>

      {!offer ? (
        <Card>
          <p className="text-body text-ink-muted">{t("noOffer")}</p>
        </Card>
      ) : !accepted ? (
        <section className="flex flex-col gap-3">
          <CardHeader title={t("steps.offer")} />
          <p className="text-meta text-ink-muted">
            {t("offerIntro", {
              date: offer.expires_at
                ? formatDate(new Date(offer.expires_at), locale, "full")
                : "",
            })}
          </p>
          <SignDocument
            entityId={offer.id}
            pdfUrl={await preboardingOfferUrl()}
            expectedName={ctx.candidate.full_name}
            sign={acceptOffer}
            doneHref="/preboarding"
          />
        </section>
      ) : (
        <>
          <Card className="flex flex-col gap-3">
            <CardHeader title={t("steps.offer")} />
            <p className="text-body text-ink">
              {t("accepted", {
                date: formatDate(new Date(offer.accepted_at!), locale, "full"),
              })}
            </p>
            <OfferCopyButton label={t("signedCopy")} />
          </Card>
          <PersonalSection ctx={ctx} done={done.personal && done.emergency} />
          <StatutorySection ctx={ctx} done={done.statutory} />
          <BankSection ctx={ctx} done={done.bank} />
          <DependentsSection ctx={ctx} />
          <CredentialsSection ctx={ctx} done={done.credentials} />
          <FinishSection
            ready={PREBOARDING_STEPS.every((s) => done[s])}
            submittedAt={ctx.candidate.submitted_at}
          />
          <p className="text-meta text-ink-muted">
            {t("privacy", { company })}
          </p>
        </>
      )}
    </>,
  );
}
