"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { staffNavItems } from "./nav-items";

// Mobile shell for staff (ui-system.md §3.2).
export function BottomNav() {
  const t = useTranslations("StaffNav");
  const tp = useTranslations("Placeholder");
  const pathname = usePathname();

  return (
    <nav
      aria-label={t("label")}
      className="fixed inset-x-0 bottom-0 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto grid max-w-lg grid-cols-5">
        {staffNavItems.map(({ key, icon: Icon, href }) => {
          const active = href !== undefined && pathname === href;
          const content = (
            <>
              <span
                className={`grid h-8 w-14 place-items-center rounded-full ${
                  active ? "bg-primary-tint text-primary" : ""
                }`}
              >
                <Icon aria-hidden size={20} strokeWidth={1.75} />
              </span>
              <span className="max-w-full truncate">{t(key)}</span>
            </>
          );
          const base =
            "flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-xs font-semibold";
          return (
            <li key={key}>
              {href ? (
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`${base} ${active ? "text-primary" : "text-ink-soft"}`}
                >
                  {content}
                </Link>
              ) : (
                <span
                  aria-disabled
                  title={tp("notBuilt")}
                  className={`${base} text-ink-soft opacity-40`}
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
