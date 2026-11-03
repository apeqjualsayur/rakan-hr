"use client";

import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

// Section pills (active = primary-tint), shared by the credential and compliance screens.
// The first item is active only on its own page; the others also on pages below them.
export function SectionTabs({
  label,
  items,
}: {
  label: string;
  items: readonly { href: string; label: string; count?: number }[];
}) {
  const pathname = usePathname();
  return (
    <nav aria-label={label} className="-mx-1 overflow-x-auto px-1">
      <ul className="flex gap-2">
        {items.map((item, index) => {
          const active =
            pathname === item.href ||
            (index > 0 && pathname.startsWith(`${item.href}/`));
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center gap-2 rounded-full border px-4 text-label whitespace-nowrap transition-colors",
                  active
                    ? "border-transparent bg-primary-tint text-primary"
                    : "border-border bg-surface text-ink-soft hover:bg-canvas",
                )}
              >
                {item.label}
                {item.count ? (
                  <span className="grid min-w-6 place-items-center rounded-full bg-accent px-1.5 text-xs leading-5 font-bold text-white tabular-nums">
                    {item.count}
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
