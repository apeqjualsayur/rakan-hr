"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { matchesPerson } from "@/lib/people/directory";
import { PersonFacts, WorkContact, type CardPerson } from "./PersonCard";
import { usePersonDialog } from "./usePersonDialog";

// EMP-08 staff directory: one card per person (photo, title, branch, credential status,
// work contact). Search filters by name, title or job role; a card opens the full card.
export function DirectoryView({
  people,
  recordBase,
  initialPersonId,
}: {
  people: readonly CardPerson[];
  recordBase?: string;
  initialPersonId?: string;
}) {
  const t = useTranslations("People.directory");
  const [query, setQuery] = useState("");
  const { open, dialog } = usePersonDialog(people, recordBase, initialPersonId);
  const shown = people.filter((p) => matchesPerson(p, query));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <label className="flex min-h-12 w-full items-center gap-2 rounded-full border border-border bg-surface px-4 text-ink-muted focus-within:border-primary md:max-w-sm">
          <Search aria-hidden size={20} strokeWidth={1.75} />
          <span className="sr-only">{t("search")}</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("search")}
            className="min-w-0 flex-1 bg-transparent text-body text-ink outline-none placeholder:text-ink-muted"
          />
        </label>
        <p className="text-meta text-ink-muted" aria-live="polite">
          {t("count", { count: shown.length })}
        </p>
      </div>

      {people.length === 0 ? (
        <EmptyState message={t("none")} />
      ) : shown.length === 0 ? (
        <EmptyState message={t("empty", { query: query.trim() })} />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 md:gap-6 xl:grid-cols-3">
          {shown.map((person) => (
            <li key={person.id}>
              <Card className="flex h-full flex-col gap-3">
                <button
                  type="button"
                  onClick={() => open(person.id)}
                  className="-m-2 rounded-tile p-2 text-left transition-colors hover:bg-canvas"
                >
                  <PersonFacts person={person} />
                </button>
                <WorkContact person={person} />
              </Card>
            </li>
          ))}
        </ul>
      )}
      {dialog}
    </div>
  );
}
