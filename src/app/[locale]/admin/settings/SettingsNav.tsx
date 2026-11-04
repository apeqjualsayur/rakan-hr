"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export type SettingsSection =
  | "company"
  | "branches"
  | "users"
  | "checklist"
  | "credentials"
  | "letters"
  | "leave"
  | "holidays";

export const settingsHref: Record<SettingsSection, string> = {
  company: "/admin/settings/company",
  branches: "/admin/settings/branches",
  users: "/admin/settings/users",
  checklist: "/admin/settings/setup-checklist",
  credentials: "/admin/settings/credentials",
  letters: "/admin/settings/letters",
  leave: "/admin/settings/leave",
  holidays: "/admin/settings/holidays",
};

// Section pills, styled like the top nav (active = primary-tint pill). Scrolls sideways
// on narrow screens so long BM labels never wrap.
export function SettingsNav({
  sections,
}: {
  sections: readonly SettingsSection[];
}) {
  const t = useTranslations("Settings.nav");
  const pathname = usePathname();
  return (
    <nav aria-label={t("label")} className="-mx-1 overflow-x-auto px-1">
      <ul className="flex gap-2">
        {sections.map((section) => {
          const href = settingsHref[section];
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={section}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center rounded-full border px-4 text-label whitespace-nowrap transition-colors",
                  active
                    ? "border-transparent bg-primary-tint text-primary"
                    : "border-border bg-surface text-ink-soft hover:bg-canvas",
                )}
              >
                {t(section)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
