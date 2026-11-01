import { useTranslations } from "next-intl";
import { LanguageToggle } from "@/components/layout/LanguageToggle";
import { Link } from "@/i18n/navigation";

// Temporary entry page until login (build step 3) routes people by role.
export default function LandingPage() {
  const t = useTranslations("Landing");
  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 px-4 py-12">
      <div className="flex justify-end">
        <LanguageToggle />
      </div>
      <h1 className="text-[40px] leading-[48px] font-bold tracking-tight">
        {t("title")}
      </h1>
      <p className="text-ink-muted">{t("subtitle")}</p>
      <section className="rounded-card border border-border bg-surface p-6">
        <h2 className="text-2xl font-semibold tracking-tight">
          {t("previewHeading")}
        </h2>
        <ul className="mt-4 flex flex-col gap-3">
          <li>
            <Link
              href="/admin"
              className="font-semibold text-primary underline-offset-4 hover:underline"
            >
              {t("adminPreview")}
            </Link>
          </li>
          <li>
            <Link
              href="/staff"
              className="font-semibold text-primary underline-offset-4 hover:underline"
            >
              {t("staffPreview")}
            </Link>
          </li>
        </ul>
      </section>
    </main>
  );
}
