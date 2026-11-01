"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { CredentialRow } from "@/components/ui/CredentialRow";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterChips } from "@/components/ui/FilterChips";
import { ProgressRing } from "@/components/ui/ProgressRing";
import type { StatusOf } from "@/lib/status-styles";

type Item = {
  key: "bls" | "practising" | "safeguarding" | "mahpc" | "hepb" | "firstAid";
  status: StatusOf<"credential">;
  action: "renewNow" | "renew" | "view" | "add";
};

const items: Item[] = [
  { key: "bls", status: "expired", action: "renewNow" },
  { key: "practising", status: "expiring_soon", action: "renew" },
  { key: "safeguarding", status: "pending", action: "view" },
  { key: "mahpc", status: "valid", action: "view" },
  { key: "hepb", status: "valid", action: "view" },
  { key: "firstAid", status: "missing", action: "add" },
];

type Filter = "all" | "actionNeeded" | "valid";
const needsAction = (item: Item) =>
  item.status === "expired" || item.status === "expiring_soon";
const filters: Record<Filter, (item: Item) => boolean> = {
  all: () => true,
  actionNeeded: needsAction,
  valid: (item) => item.status === "valid",
};

// Recreation of ui-reference/mobile-my-credentials.png (CRD-04).
// The FAB ("Add credential") is this screen's single accent; it is rendered by the page.
export function MyCredentialsScreen() {
  const t = useTranslations("Demo.credentials");
  const [filter, setFilter] = useState<Filter>("all");
  const visible = items.filter(filters[filter]);

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h1 className="text-display-sm text-ink">{t("title")}</h1>
        <p className="text-body text-ink-muted">{t("role")}</p>
      </header>

      <Card>
        <ProgressRing
          percent={50}
          size={88}
          headline={t("headline", { valid: 2, total: 4 })}
          body={t("advice")}
        />
      </Card>

      <FilterChips
        label={t("filterLabel")}
        value={filter}
        onChange={setFilter}
        chips={(Object.keys(filters) as Filter[]).map((value) => ({
          value,
          label: t(value),
          count: items.filter(filters[value]).length,
        }))}
      />

      {visible.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {visible.map((item) => (
            <li key={item.key}>
              <CredentialRow
                title={t(`items.${item.key}`)}
                meta={t(`items.${item.key}Meta`)}
                status={item.status}
                actionLabel={t(`actions.${item.action}`)}
                actionHref="/design/my-credentials"
              />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState message={t("empty")} />
      )}
    </div>
  );
}
