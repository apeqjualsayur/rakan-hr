"use client";

import { useTranslations } from "next-intl";
import {
  isNavActive,
  staffNavItems,
  type StaffNavKey,
} from "@/components/layout/nav-items";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

// §3.2 Mobile bottom nav: white, top border, safe-area padding.
// Active = primary-tint pill behind the icon + primary label.
export function BottomNav({ active }: { active?: StaffNavKey }) {
  const t = useTranslations("StaffNav");
  const tp = useTranslations("Placeholder");
  const pathname = usePathname();

  return (
    <nav
      aria-label={t("label")}
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto grid max-w-lg grid-cols-5">
        {staffNavItems.map(({ key, icon: Icon, href }) => {
          const isActive = active
            ? key === active
            : isNavActive(href, pathname);
          const content = (
            <>
              <span
                className={cn(
                  "grid h-9 w-16 place-items-center rounded-full transition-colors",
                  isActive && "bg-primary-tint text-primary",
                )}
              >
                <Icon aria-hidden size={24} strokeWidth={1.75} />
              </span>
              <span className="max-w-full truncate">{t(key)}</span>
            </>
          );
          const classes = cn(
            "flex min-h-16 flex-col items-center justify-center gap-1 px-0.5 py-2 text-xs leading-4 font-medium min-[400px]:text-[0.8125rem]",
            isActive ? "font-semibold text-primary" : "text-ink-soft",
          );
          return (
            <li key={key}>
              {href ? (
                <Link
                  href={href}
                  aria-current={isActive ? "page" : undefined}
                  className={classes}
                >
                  {content}
                </Link>
              ) : (
                <span
                  aria-disabled
                  aria-current={isActive ? "page" : undefined}
                  title={tp("notBuilt")}
                  className={cn(classes, !isActive && "opacity-40")}
                >
                  {content}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
