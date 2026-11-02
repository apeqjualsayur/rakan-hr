"use client";

import { useState } from "react";
import { ChevronRight, Plus, Search } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { buttonVariants } from "@/components/ui/button";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterChips } from "@/components/ui/FilterChips";
import { PersonAvatar } from "@/components/ui/PersonRow";
import { Select } from "@/components/ui/SelectField";
import { StatusChip } from "@/components/ui/StatusChip";
import { Link } from "@/i18n/navigation";
import { dateFromIso, formatDate, malaysiaToday } from "@/lib/format";
import { EMPLOYEE_STATUSES } from "@/lib/people/employee";
import {
  filterPeople,
  NO_FILTERS,
  type ListFilters,
  type ListPerson,
} from "@/lib/people/list";
import { EMPLOYMENT_TYPES } from "@/lib/people/records";
import { cn } from "@/lib/utils";

export type PersonListRow = ListPerson & {
  id: string;
  photoUrl?: string;
  start_date: string | null;
};

type Option = { id: string; name: string | null };

// One accent action: Add employee. Filters: status chips (with counts), branch, job role,
// employment type and a search box.
export function PeopleList({
  people,
  branches,
  roles,
  canAdd,
}: {
  people: readonly PersonListRow[];
  branches: readonly Option[];
  roles: readonly Option[];
  canAdd: boolean;
}) {
  const t = useTranslations("People");
  const tl = useTranslations("People.list");
  const ts = useTranslations("Status.employee");
  const te = useTranslations("People.employment.employmentTypes");
  const locale = useLocale();
  const today = malaysiaToday();
  const [filters, setFilters] = useState<ListFilters>(NO_FILTERS);
  const set = (patch: Partial<ListFilters>) =>
    setFilters((f) => ({ ...f, ...patch }));

  const roleName = (id: string | null) =>
    roles.find((r) => r.id === id)?.name ?? null;
  const branchName = (id: string | null) =>
    branches.find((b) => b.id === id)?.name ?? null;
  const matching = filterPeople(people, filters, roleName);
  const shown =
    filters.status === "all"
      ? matching
      : matching.filter((p) => p.status === filters.status);
  const filtered =
    filters.status !== "all" ||
    filters.branch ||
    filters.role ||
    filters.type ||
    filters.query;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <label className="flex min-h-12 w-full items-center gap-2 rounded-full border border-border bg-surface px-4 text-ink-muted focus-within:border-primary lg:max-w-md">
          <Search aria-hidden size={20} strokeWidth={1.75} />
          <span className="sr-only">{tl("search")}</span>
          <input
            type="search"
            value={filters.query}
            onChange={(e) => set({ query: e.target.value })}
            placeholder={tl("search")}
            className="min-w-0 flex-1 bg-transparent text-body text-ink outline-none placeholder:text-ink-muted"
          />
        </label>
        {canAdd ? (
          <Link
            href="/admin/people/new"
            className={cn(buttonVariants({ variant: "accent" }))}
          >
            <Plus aria-hidden />
            {tl("add")}
          </Link>
        ) : null}
      </div>

      <FilterChips
        label={tl("filterStatus")}
        value={filters.status}
        onChange={(status) => set({ status })}
        chips={[
          { value: "all", label: tl("all"), count: matching.length },
          ...EMPLOYEE_STATUSES.map((s) => ({
            value: s,
            label: ts(s),
            count: matching.filter((p) => p.status === s).length,
          })),
        ]}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-2 text-label text-ink">
          {tl("branch")}
          <Select
            value={filters.branch}
            onChange={(e) => set({ branch: e.target.value })}
          >
            <option value="">{tl("allBranches")}</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name ?? t("unnamedBranch")}
              </option>
            ))}
            <option value="none">{t("noBranch")}</option>
          </Select>
        </label>
        <label className="flex flex-col gap-2 text-label text-ink">
          {tl("role")}
          <Select
            value={filters.role}
            onChange={(e) => set({ role: e.target.value })}
          >
            <option value="">{tl("allRoles")}</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
            <option value="none">{t("noRole")}</option>
          </Select>
        </label>
        <label className="flex flex-col gap-2 text-label text-ink">
          {tl("type")}
          <Select
            value={filters.type}
            onChange={(e) => set({ type: e.target.value })}
          >
            <option value="">{tl("allTypes")}</option>
            {EMPLOYMENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {te(type)}
              </option>
            ))}
          </Select>
        </label>
      </div>

      <Card className="flex flex-col gap-2">
        <p className="text-meta text-ink-muted" aria-live="polite">
          {tl("count", { count: shown.length })}
        </p>
        {people.length === 0 ? (
          <EmptyState message={tl("none")} />
        ) : shown.length === 0 ? (
          <EmptyState
            message={tl("empty")}
            action={
              filtered ? (
                <Button
                  variant="outline"
                  size="row"
                  onClick={() => setFilters(NO_FILTERS)}
                >
                  {tl("clear")}
                </Button>
              ) : null
            }
          />
        ) : (
          <ul className="divide-y divide-border">
            {shown.map((p) => {
              const meta = [
                p.employee_no,
                p.job_title ?? roleName(p.job_role_id) ?? t("noRole"),
                p.branch_id
                  ? (branchName(p.branch_id) ?? t("unnamedBranch"))
                  : t("noBranch"),
                p.employment_type ? te(p.employment_type) : tl("noContract"),
                p.start_date && p.start_date > today
                  ? tl("startsOn", {
                      date: formatDate(
                        dateFromIso(p.start_date),
                        locale,
                        "full",
                      ),
                    })
                  : null,
              ]
                .filter(Boolean)
                .join(" · ");
              return (
                <li key={p.id}>
                  <Link
                    href={`/admin/people/${p.id}`}
                    className="-mx-2 flex items-center gap-4 rounded-tile px-2 py-3 transition-colors hover:bg-canvas"
                  >
                    <PersonAvatar
                      id={p.id}
                      name={p.full_name}
                      photoUrl={p.photoUrl}
                    />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-h3 font-semibold text-ink">
                        {p.full_name}
                      </span>
                      <span className="text-meta text-ink-muted">{meta}</span>
                    </span>
                    <StatusChip domain="employee" status={p.status} />
                    <ChevronRight
                      aria-hidden
                      size={20}
                      strokeWidth={1.75}
                      className="shrink-0 text-ink-muted"
                    />
                    <span className="sr-only">{tl("open")}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
