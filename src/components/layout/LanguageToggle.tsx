"use client";

import { useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

export function LanguageToggle() {
  const t = useTranslations("LanguageToggle");
  const current = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  return (
    <div
      role="group"
      aria-label={t("label")}
      className="inline-flex rounded-full border border-border bg-surface p-0.5"
    >
      {routing.locales.map((locale) => {
        const selected = locale === current;
        return (
          <button
            key={locale}
            type="button"
            lang={locale}
            aria-pressed={selected}
            disabled={isPending}
            onClick={() =>
              // Keeps the query (e.g. the pre-boarding link token) when switching.
              startTransition(() =>
                router.replace(`${pathname}${window.location.search}`, {
                  locale,
                }),
              )
            }
            className={`min-h-10 min-w-11 rounded-full px-3 text-sm font-semibold transition-colors disabled:opacity-40 ${
              selected
                ? "bg-ink text-white"
                : "text-ink-soft hover:bg-primary-tint"
            }`}
          >
            {t(locale)}
          </button>
        );
      })}
    </div>
  );
}
