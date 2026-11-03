"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CredentialRow } from "@/components/ui/CredentialRow";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterChips } from "@/components/ui/FilterChips";
import { needsAction, sortRows } from "@/lib/credentials/logic";
import type { CredentialStatusRow } from "@/lib/credentials/types";
import { useCredentialText } from "./useCredentialText";

type Filter = "all" | "actionNeeded" | "valid";
const filters: Record<Filter, (row: CredentialStatusRow) => boolean> = {
  all: () => true,
  actionNeeded: needsAction,
  valid: (row) => row.display_status === "valid",
};

// CRD-04 list: filter chips with counts, then one credential row each, most urgent first.
// viewHref + "/<id>" opens a record; addHref + "?type=…&renew=…" adds or renews one.
export function CredentialList({
  rows,
  viewHref,
  addHref,
  showFilters = true,
}: {
  rows: readonly CredentialStatusRow[];
  viewHref: string;
  addHref: string;
  showFilters?: boolean;
}) {
  const t = useTranslations("Credentials");
  const text = useCredentialText();
  const [filter, setFilter] = useState<Filter>("all");
  const sorted = sortRows(rows);
  const visible = sorted.filter(filters[filter]);

  return (
    <div className="flex flex-col gap-4">
      {showFilters ? (
        <FilterChips
          label={t("filters.label")}
          value={filter}
          onChange={setFilter}
          chips={(Object.keys(filters) as Filter[]).map((value) => ({
            value,
            label: t(`filters.${value}`),
            count: sorted.filter(filters[value]).length,
          }))}
        />
      ) : null}
      {visible.length ? (
        <ul className="flex flex-col gap-3">
          {visible.map((row) => {
            const { title, meta, action, target } = text(row);
            const href = target.startsWith("new?")
              ? `${addHref}${addHref.includes("?") ? "&" : "?"}${target.slice(4)}`
              : `${viewHref}/${target}`;
            return (
              <li key={row.credential_type_id}>
                <CredentialRow
                  title={title}
                  meta={meta}
                  status={row.display_status}
                  actionLabel={t(`actions.${action}`)}
                  actionHref={href}
                />
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState message={t("empty")} />
      )}
    </div>
  );
}
