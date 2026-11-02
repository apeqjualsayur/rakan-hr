"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export type PeopleSection = "list" | "directory" | "orgChart" | "requests";

export const peopleHref: Record<PeopleSection, string> = {
  list: "/admin/people",
  directory: "/admin/people/directory",
  orgChart: "/admin/people/org-chart",
  requests: "/admin/people/requests",
};

/** "All people" owns the employee pages below /admin/people too. */
function isActive(section: PeopleSection, pathname: string) {
  const href = peopleHref[section];
  if (section !== "list")
    return pathname === href || pathname.startsWith(`${href}/`);
  const others = Object.values(peopleHref).filter((h) => h !== href);
  return (
    (pathname === href || pathname.startsWith(`${href}/`)) &&
    !others.some((h) => pathname === h || pathname.startsWith(`${h}/`))
  );
}

// Section pills, styled like Settings (active = primary-tint pill). A count badge shows
// how many change requests are waiting.
export function PeopleNav({
  sections,
  pendingRequests = 0,
}: {
  sections: readonly PeopleSection[];
  pendingRequests?: number;
}) {
  const t = useTranslations("People.nav");
  const pathname = usePathname();
  return (
    <nav aria-label={t("label")} className="-mx-1 overflow-x-auto px-1">
      <ul className="flex gap-2">
        {sections.map((section) => {
          const active = isActive(section, pathname);
          return (
            <li key={section}>
              <Link
                href={peopleHref[section]}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center gap-2 rounded-full border px-4 text-label whitespace-nowrap transition-colors",
                  active
                    ? "border-transparent bg-primary-tint text-primary"
                    : "border-border bg-surface text-ink-soft hover:bg-canvas",
                )}
              >
                {t(section)}
                {section === "requests" && pendingRequests > 0 ? (
                  <span className="grid min-w-6 place-items-center rounded-full bg-accent px-1.5 text-xs leading-5 font-bold text-white tabular-nums">
                    {pendingRequests}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
