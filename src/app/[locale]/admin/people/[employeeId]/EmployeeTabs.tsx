"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import type { EmployeeTab } from "./tabs";

// Tabs are links (?tab=…) so each one has its own URL and the server loads only its data.
export function EmployeeTabs({
  employeeId,
  tabs,
  active,
}: {
  employeeId: string;
  tabs: readonly EmployeeTab[];
  active: EmployeeTab;
}) {
  const t = useTranslations("People.employee.tabs");
  return (
    <nav aria-label={t("label")} className="-mx-1 overflow-x-auto px-1">
      <ul className="flex gap-2 border-b border-border">
        {tabs.map((tab) => (
          <li key={tab}>
            <Link
              href={`/admin/people/${employeeId}?tab=${tab}`}
              scroll={false}
              aria-current={tab === active ? "page" : undefined}
              className={cn(
                "-mb-px flex min-h-12 items-center border-b-2 px-4 text-label whitespace-nowrap transition-colors",
                tab === active
                  ? "border-primary text-primary"
                  : "border-transparent text-ink-soft hover:text-ink",
              )}
            >
              {t(tab)}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
