import { useTranslations } from "next-intl";

export default function AdminHomePage() {
  const t = useTranslations("Placeholder");
  return (
    <section className="rounded-card border border-border bg-surface p-6">
      <h1 className="text-[40px] leading-[48px] font-bold tracking-tight">
        {t("adminTitle")}
      </h1>
      <p className="mt-2 text-ink-muted">{t("body")}</p>
    </section>
  );
}
