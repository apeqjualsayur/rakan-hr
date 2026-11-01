import { useTranslations } from "next-intl";

export default function StaffHomePage() {
  const t = useTranslations("Placeholder");
  return (
    <section className="mt-2 rounded-card border border-border bg-surface p-5">
      <h1 className="text-[30px] leading-[38px] font-bold tracking-tight">
        {t("staffTitle")}
      </h1>
      <p className="mt-2 text-ink-muted">{t("body")}</p>
    </section>
  );
}
