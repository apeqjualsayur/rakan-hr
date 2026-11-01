import { useTranslations } from "next-intl";
import { TestNotificationButton } from "./TestNotificationButton";

export default function AdminHomePage() {
  const t = useTranslations("Placeholder");
  return (
    <section className="flex flex-col gap-6 rounded-card border border-border bg-surface p-6">
      <div>
        <h1 className="text-[40px] leading-[48px] font-bold tracking-tight">
          {t("adminTitle")}
        </h1>
        <p className="mt-2 text-ink-muted">{t("body")}</p>
      </div>
      {process.env.NODE_ENV !== "production" ? (
        <TestNotificationButton />
      ) : null}
    </section>
  );
}
