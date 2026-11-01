"use client";

import { Bell, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { LanguageToggle } from "@/components/layout/LanguageToggle";
import { Logo } from "@/components/layout/Logo";
import { adminNavItems, type AdminNavKey } from "@/components/layout/nav-items";
import { PersonAvatar } from "@/components/ui/PersonRow";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

// §3.1 Desktop top nav: logo + wordmark · nav items (active = primary-tint pill) ·
// search pill · bell (accent dot when unread) · avatar. White, 1 px bottom border.
// Below 1280 px the nav items scroll sideways so tablets (≥ 768 px) stay usable.
export function TopNav({
  active,
  unread = false,
  user,
}: {
  /** Override the active item (otherwise derived from the URL). */
  active?: AdminNavKey;
  unread?: boolean;
  user?: { id: string; name: string };
}) {
  const t = useTranslations("AdminNav");
  const tp = useTranslations("Placeholder");
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-surface">
      <div className="mx-auto flex max-w-[1800px] items-center gap-4 px-4 py-3 md:px-8 xl:gap-8 xl:px-16">
        <Logo href="/admin" />

        <nav aria-label={t("label")} className="min-w-0 flex-1 overflow-x-auto">
          <ul className="flex items-center gap-1">
            {adminNavItems.map(({ key, href }) => {
              const isActive = active ? key === active : href === pathname;
              const classes = cn(
                "flex min-h-11 items-center rounded-full px-4 text-body whitespace-nowrap transition-colors",
                isActive
                  ? "bg-primary-tint font-semibold text-primary"
                  : "text-ink-soft hover:bg-canvas",
              );
              return (
                <li key={key}>
                  {href ? (
                    <Link
                      href={href}
                      aria-current={isActive ? "page" : undefined}
                      className={classes}
                    >
                      {t(key)}
                    </Link>
                  ) : (
                    <span
                      aria-disabled
                      aria-current={isActive ? "page" : undefined}
                      title={tp("notBuilt")}
                      className={cn(
                        classes,
                        !isActive && "cursor-not-allowed opacity-40",
                      )}
                    >
                      {t(key)}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="flex shrink-0 items-center gap-2 xl:gap-3">
          <label className="hidden min-h-11 items-center gap-2 rounded-full bg-canvas px-4 text-ink-muted xl:flex">
            <Search aria-hidden size={20} strokeWidth={1.75} />
            <span className="sr-only">{t("search")}</span>
            <input
              type="search"
              placeholder={t("search")}
              className="w-36 bg-transparent text-body text-ink outline-none placeholder:text-ink-muted 2xl:w-52"
            />
          </label>
          <LanguageToggle />
          <button
            type="button"
            aria-label={unread ? t("notificationsUnread") : t("notifications")}
            className="relative grid size-12 place-items-center rounded-full border border-border bg-surface text-ink-soft transition-colors hover:bg-canvas"
          >
            <Bell aria-hidden size={20} strokeWidth={1.75} />
            {unread ? (
              <span
                aria-hidden
                className="absolute top-2.5 right-3 size-2.5 rounded-full bg-accent ring-2 ring-surface"
              />
            ) : null}
          </button>
          {user ? (
            <button
              type="button"
              aria-label={t("account")}
              className="rounded-full"
            >
              <PersonAvatar id={user.id} name={user.name} />
            </button>
          ) : null}
        </div>
      </div>
    </header>
  );
}
