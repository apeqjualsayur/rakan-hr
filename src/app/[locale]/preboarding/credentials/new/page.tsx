import { Suspense } from "react";
import { ChevronLeft } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { CredentialForm } from "@/components/credentials/CredentialForm";
import { AuthLoading } from "@/components/layout/AuthLayout";
import { LanguageToggle } from "@/components/layout/LanguageToggle";
import { Logo } from "@/components/layout/Logo";
import { Card } from "@/components/ui/Card";
import { Link } from "@/i18n/navigation";
import { typeName } from "@/lib/credentials/logic";
import { loadPreboarding } from "@/lib/hiring/preboarding";

export async function generateMetadata() {
  const t = await getTranslations("Preboarding");
  return { title: t("uploadTitle") };
}

// HIR-04: the Step 6 credential form (CRD-05) in the pre-boarding portal.
export default async function PreboardingCredentialPage(
  props: PageProps<"/[locale]/preboarding/credentials/new">,
) {
  const t = await getTranslations("Auth");
  return (
    <Suspense fallback={<AuthLoading label={t("loading")} />}>
      <Upload {...props} />
    </Suspense>
  );
}

async function Upload({
  searchParams,
}: PageProps<"/[locale]/preboarding/credentials/new">) {
  const t = await getTranslations("Preboarding");
  const locale = await getLocale();
  const { type } = await searchParams;
  const ctx = await loadPreboarding();
  const types = typeof ctx === "string" ? [] : ctx.types;
  const chosen = types.find((x) => x.id === type);
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 pt-[max(env(safe-area-inset-top),12px)] pb-12">
      <header className="flex items-center justify-between py-3">
        <Logo href="/preboarding" />
        <LanguageToggle />
      </header>
      <Link
        href="/preboarding"
        className="inline-flex min-h-11 w-fit items-center gap-1 text-label text-primary underline-offset-4 hover:underline"
      >
        <ChevronLeft aria-hidden size={20} strokeWidth={1.75} />
        {t("back")}
      </Link>
      <h1 className="text-display-sm text-ink">
        {chosen ? typeName(chosen, locale) : t("uploadTitle")}
      </h1>
      {typeof ctx === "string" || !ctx.employee ? (
        <Card>
          <p className="text-body text-ink-muted">{t("endedBody")}</p>
        </Card>
      ) : (
        <CredentialForm
          types={types}
          initialTypeId={chosen?.id}
          doneHref="/preboarding"
          cancelHref="/preboarding"
          preboarding
        />
      )}
    </div>
  );
}
