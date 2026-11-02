"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { EmptyState } from "@/components/ui/EmptyState";
import { PersonAvatar } from "@/components/ui/PersonRow";
import {
  buildOrgTree,
  countReports,
  personTitle,
  type OrgNode,
} from "@/lib/people/directory";
import { cn } from "@/lib/utils";
import type { CardPerson } from "./PersonCard";
import { usePersonDialog } from "./usePersonDialog";

// EMP-09 org chart from manager_id, drawn as an indented tree so it fits a phone as well
// as a desktop. Selecting a person opens their directory card.
export function OrgChart({
  people,
  recordBase,
}: {
  people: readonly CardPerson[];
  recordBase?: string;
}) {
  const t = useTranslations("People.orgChart");
  const { open, dialog } = usePersonDialog(people, recordBase);
  const tree = buildOrgTree(people);

  if (tree.length === 0) return <EmptyState message={t("none")} />;
  return (
    <>
      <ul className="flex flex-col gap-3">
        {tree.map((node) => (
          <OrgBranch key={node.person.id} node={node} onOpen={open} root />
        ))}
      </ul>
      {dialog}
    </>
  );
}

function OrgBranch({
  node,
  onOpen,
  root = false,
}: {
  node: OrgNode<CardPerson>;
  onOpen: (id: string) => void;
  root?: boolean;
}) {
  const t = useTranslations("People.orgChart");
  const tp = useTranslations("People");
  const [expanded, setExpanded] = useState(true);
  const { person, reports } = node;
  const total = countReports(node);
  const title = personTitle(person);

  return (
    <li
      className={cn(
        "relative flex flex-col gap-3",
        // Connector from the parent's vertical line to this card.
        !root &&
          "before:absolute before:top-9 before:-left-5 before:h-px before:w-5 before:bg-border md:before:-left-8 md:before:w-8",
      )}
    >
      <div className="flex items-center gap-2 rounded-tile border border-border bg-surface p-2 pr-3 md:max-w-md">
        <button
          type="button"
          onClick={() => onOpen(person.id)}
          className="flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-control p-1 text-left transition-colors hover:bg-canvas"
        >
          <PersonAvatar
            id={person.id}
            name={person.full_name}
            photoUrl={person.photoUrl}
          />
          <span className="flex min-w-0 flex-col">
            <span className="text-h3 font-semibold text-ink">
              {person.full_name}
            </span>
            <span className="text-meta text-ink-muted">
              {[
                title ?? tp("noRole"),
                total ? t("reports", { count: total }) : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </span>
        </button>
        {reports.length ? (
          <button
            type="button"
            aria-expanded={expanded}
            aria-label={expanded ? t("hideReports") : t("showReports")}
            onClick={() => setExpanded((v) => !v)}
            className="grid size-11 shrink-0 place-items-center rounded-full text-ink-soft transition-colors hover:bg-canvas"
          >
            {expanded ? (
              <ChevronDown aria-hidden size={20} strokeWidth={1.75} />
            ) : (
              <ChevronRight aria-hidden size={20} strokeWidth={1.75} />
            )}
          </button>
        ) : null}
      </div>
      {reports.length && expanded ? (
        <ul className="ml-6 flex flex-col gap-3 border-l border-border pl-5 md:ml-8 md:pl-8">
          {reports.map((child) => (
            <OrgBranch key={child.person.id} node={child} onOpen={onOpen} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}
