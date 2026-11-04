"use client";

import { useState } from "react";
import { CheckCircle2, Plus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterChips } from "@/components/ui/FilterChips";
import { StatusChip } from "@/components/ui/StatusChip";
import { Link } from "@/i18n/navigation";
import { formatDate } from "@/lib/format";
import { CANDIDATE_STAGES, type Candidate } from "@/lib/hiring/types";
import { cn } from "@/lib/utils";

export type BoardCandidate = Pick<
  Candidate,
  | "id"
  | "full_name"
  | "job_opening_id"
  | "stage"
  | "stage_changed_at"
  | "offer_accepted_at"
  | "preboarding_submitted_at"
>;

// One column per stage; on phones the columns scroll sideways. Opening the card shows the
// candidate, where they are moved on.
export function CandidateBoard({
  candidates,
  openings,
  canAdd,
}: {
  candidates: readonly BoardCandidate[];
  openings: readonly { id: string; title: string; status: string }[];
  canAdd: boolean;
}) {
  const t = useTranslations("Hiring.board");
  const locale = useLocale();
  const [opening, setOpening] = useState("all");
  const titleOf = new Map(openings.map((o) => [o.id, o.title]));
  const shown = candidates.filter(
    (c) => opening === "all" || c.job_opening_id === opening,
  );
  const withCandidates = openings.filter(
    (o) =>
      o.status !== "closed" ||
      candidates.some((c) => c.job_opening_id === o.id),
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <FilterChips
          label={t("filterLabel")}
          value={opening}
          onChange={setOpening}
          chips={[
            { value: "all", label: t("allOpenings"), count: candidates.length },
            ...withCandidates.map((o) => ({
              value: o.id,
              label: o.title,
              count: candidates.filter((c) => c.job_opening_id === o.id).length,
            })),
          ]}
        />
        {canAdd ? (
          <Link
            href={
              opening === "all"
                ? "/admin/hiring/candidates/new"
                : `/admin/hiring/candidates/new?opening=${opening}`
            }
            className={cn(buttonVariants({ variant: "accent" }), "shrink-0")}
          >
            <Plus aria-hidden />
            {t("addCandidate")}
          </Link>
        ) : null}
      </div>

      {candidates.length === 0 ? (
        <Card>
          <EmptyState
            message={openings.length ? t("empty") : t("emptyNoOpenings")}
            action={
              openings.length || !canAdd ? null : (
                <Link
                  href="/admin/hiring/openings/new"
                  className={buttonVariants({
                    variant: "outline",
                    size: "row",
                  })}
                >
                  {t("createOpening")}
                </Link>
              )
            }
          />
        </Card>
      ) : (
        <div className="-mx-4 overflow-x-auto px-4 pb-2 md:mx-0 md:px-0">
          <div className="grid min-w-[1100px] grid-cols-5 gap-4">
            {CANDIDATE_STAGES.map((stage) => {
              const column = shown.filter((c) => c.stage === stage);
              return (
                <section
                  key={stage}
                  aria-labelledby={`stage-${stage}`}
                  className="flex flex-col gap-3 rounded-card bg-track/40 p-3"
                >
                  <h2
                    id={`stage-${stage}`}
                    className="flex items-center justify-between px-1 text-label text-ink-soft"
                  >
                    <StatusChip domain="candidate" status={stage} />
                    <span className="tabular-nums">{column.length}</span>
                  </h2>
                  {column.length === 0 ? (
                    <p className="px-1 py-2 text-meta text-ink-muted">
                      {t("emptyColumn")}
                    </p>
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {column.map((c) => (
                        <li key={c.id}>
                          <Link
                            href={`/admin/hiring/candidates/${c.id}`}
                            className="flex flex-col gap-1 rounded-tile border border-border bg-surface p-3 transition-colors hover:border-ink-muted"
                          >
                            <span className="text-body font-medium text-ink">
                              {c.full_name}
                            </span>
                            <span className="text-meta text-ink-muted">
                              {titleOf.get(c.job_opening_id) ?? ""}
                            </span>
                            <span className="text-meta text-ink-muted">
                              {t("since", {
                                date: formatDate(
                                  new Date(c.stage_changed_at),
                                  locale,
                                  "short",
                                ),
                              })}
                            </span>
                            {c.stage === "offer" && c.offer_accepted_at ? (
                              <span className="inline-flex items-center gap-1 text-meta font-medium text-primary">
                                <CheckCircle2
                                  aria-hidden
                                  size={16}
                                  strokeWidth={1.75}
                                />
                                {c.preboarding_submitted_at
                                  ? t("preboardingDone")
                                  : t("accepted")}
                              </span>
                            ) : null}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
