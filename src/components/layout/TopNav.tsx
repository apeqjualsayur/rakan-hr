"use client";

import { Bell, CircleUser, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { LanguageToggle } from "./LanguageToggle";
import { Logo } from "./Logo";
import { adminNavItems } from "./nav-items";

// Desktop shell for admin roles (ui-system.md §3.1). Placeholder: search,
// bell and avatar are not wired up yet.
export function TopNav() {
  const t = useTranslations("AdminNav");
  const tp = useTranslations("Placeholder");
  const pathname = usePathname();

  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex max-w-[1800px] items-center gap-6 px-4 py-3 md:px-16">
        <Logo href="/admin" />

        <nav aria-label={t("label")} className="min-w-0 flex-1 overflow-x-auto">
          <ul className="flex items-center gap-1">
            {adminNavItems.map(({ key, icon: Icon, href }) => {
              const active = href !== undefined && pathname === href;
              const base =
                "flex min-h-11 items-center gap-2 whitespace-nowrap rounded-full px-4 text-sm font-semibold";
              return (
                <li key={key}>
                  {href ? (
                    <Link
                      href={href}
                      aria-current={active ? "page" : undefined}
                      className={`${base} ${
                        active
                          ? "bg-primary-tint text-primary"
                          : "text-ink-soft hover:bg-canvas"
                      }`}
                    >
                      <Icon aria-hidden size={20} strokeWidth={1.75} />
                      {t(key)}
                    </Link>
                  ) : (
                    <span
                      aria-disabled
                      title={tp("notBuilt")}
                      className={`${base} cursor-not-allowed text-ink-soft opacity-40`}
                    >
                      <Icon aria-hidden size={20} strokeWidth={1.75} />
                      {t(key)}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="flex items-center gap-3">
          <label className="hidden min-h-11 items-center gap-2 rounded-full bg-canvas px-4 text-ink-muted xl:flex">
            <Search aria-hidden size={20} strokeWidth={1.75} />
            <span className="sr-only">{t("search")}</span>
            <input
              type="search"
              disabled
              placeholder={t("search")}
              className="w-48 bg-transparent text-sm outline-none placeholder:text-ink-muted"
            />
          </label>
          <LanguageToggle />
          <button
            type="button"
            disabled
            aria-label={t("notifications")}
            className="grid size-11 place-items-center rounded-full text-ink-soft"
          >
            <Bell aria-hidden size={20} strokeWidth={1.75} />
          </button>
          <button
            type="button"
            disabled
            aria-label={t("account")}
            className="grid size-11 place-items-center rounded-full text-ink-soft"
          >
            <CircleUser aria-hidden size={28} strokeWidth={1.75} />
          </button>
        </div>
      </div>
    </header>
  );
}
