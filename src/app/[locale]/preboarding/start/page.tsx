import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { StartForm } from "./StartForm";

export async function generateMetadata() {
  const t = await getTranslations("Preboarding");
  return { title: t("startTitle") };
}

// HIR-04: where the emailed link lands. The link works once, so it is only used when the
// candidate presses the button (email scanners that open links do not use it up).
export default async function PreboardingStartPage({
  searchParams,
}: PageProps<"/[locale]/preboarding/start">) {
  const t = await getTranslations("Preboarding");
  return (
    <AuthLayout title={t("startTitle")} intro={t("startIntro")}>
      <Suspense fallback={null}>
        <TokenForm searchParams={searchParams} />
      </Suspense>
    </AuthLayout>
  );
}

async function TokenForm({
  searchParams,
}: Pick<PageProps<"/[locale]/preboarding/start">, "searchParams">) {
  const { t: token } = await searchParams;
  return <StartForm token={typeof token === "string" ? token : ""} />;
}
