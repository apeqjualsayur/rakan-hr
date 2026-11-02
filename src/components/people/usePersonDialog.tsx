"use client";

import { useMemo, useState } from "react";
import type { CardPerson } from "./PersonCard";
import { PersonDialog } from "./PersonDialog";

/** Opens a person's directory card by id; `?person=<id>` in the URL opens it on load. */
export function usePersonDialog(
  people: readonly CardPerson[],
  recordBase?: string,
  initialId?: string,
) {
  const [openId, setOpenId] = useState<string | null>(initialId ?? null);
  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const person = openId ? (byId.get(openId) ?? null) : null;
  const manager = person?.manager_id
    ? (byId.get(person.manager_id) ?? null)
    : null;
  const reportsCount = person
    ? people.filter((p) => p.manager_id === person.id).length
    : 0;

  return {
    open: (id: string) => setOpenId(id),
    dialog: (
      <PersonDialog
        person={person}
        manager={manager}
        reportsCount={reportsCount}
        recordBase={recordBase}
        onClose={() => setOpenId(null)}
      />
    ),
  };
}
