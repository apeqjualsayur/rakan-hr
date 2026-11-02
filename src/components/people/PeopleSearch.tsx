"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { PersonAvatar } from "@/components/ui/PersonRow";
import { Link } from "@/i18n/navigation";
import {
  personTitle,
  searchTerm,
  type DirectoryPerson,
} from "@/lib/people/directory";
import { createClient } from "@/lib/supabase/client";

type Hit = Pick<
  DirectoryPerson,
  "id" | "full_name" | "job_title" | "job_role_name" | "branch_name"
>;

// EMP-08: the top-nav search pill finds people by name, job title or job role (v_directory,
// which every member may read). Results open the employee record.
export function PeopleSearch({
  recordBase = "/admin/people",
}: {
  recordBase?: string;
}) {
  const t = useTranslations("AdminNav");
  const ts = useTranslations("People.search");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [failed, setFailed] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);
  const term = searchTerm(query);

  useEffect(() => {
    if (!term) return;
    let current = true;
    const timer = window.setTimeout(async () => {
      // Quoted so spaces are safe; searchTerm() already removed quotes and filter syntax.
      const like = `"%${term}%"`;
      const { data, error } = await createClient()
        .from("v_directory")
        .select("id, full_name, job_title, job_role_name, branch_name")
        .or(
          `full_name.ilike.${like},job_title.ilike.${like},job_role_name.ilike.${like}`,
        )
        .order("full_name")
        .limit(8);
      if (!current) return;
      setFailed(Boolean(error));
      setHits((data as Hit[] | null) ?? []);
    }, 200);
    return () => {
      current = false;
      window.clearTimeout(timer);
    };
  }, [term]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  // Arrow keys move between the input and the results; Escape closes.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      setOpen(false);
      wrapper.current?.querySelector("input")?.focus();
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const items = [
      ...(wrapper.current?.querySelectorAll<HTMLElement>("input, [data-hit]") ??
        []),
    ];
    const index = items.indexOf(document.activeElement as HTMLElement);
    const next = items[index + (event.key === "ArrowDown" ? 1 : -1)];
    if (next) {
      event.preventDefault();
      next.focus();
    }
  };

  const showPanel = open && query.trim() !== "";
  return (
    <div
      ref={wrapper}
      className="relative hidden xl:block"
      onKeyDown={onKeyDown}
    >
      <label className="flex min-h-11 items-center gap-2 rounded-full bg-canvas px-4 text-ink-muted focus-within:ring-2 focus-within:ring-primary">
        <Search aria-hidden size={20} strokeWidth={1.75} />
        <span className="sr-only">{t("searchPeople")}</span>
        <input
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={t("search")}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showPanel}
          aria-controls="people-search-results"
          autoComplete="off"
          className="w-36 bg-transparent text-body text-ink outline-none placeholder:text-ink-muted 2xl:w-52"
        />
      </label>
      {showPanel ? (
        <div
          id="people-search-results"
          className="absolute right-0 z-40 mt-2 w-80 overflow-hidden rounded-card border border-border bg-surface"
        >
          {!term ? (
            <p className="px-5 py-4 text-meta text-ink-muted">{ts("hint")}</p>
          ) : failed ? (
            <p className="px-5 py-4 text-meta text-danger">{ts("failed")}</p>
          ) : hits && hits.length === 0 ? (
            <p className="px-5 py-4 text-meta text-ink-muted">{ts("none")}</p>
          ) : (
            <ul aria-label={ts("results")} aria-live="polite">
              {(hits ?? []).map((hit) => (
                <li
                  key={hit.id}
                  className="border-b border-border last:border-b-0"
                >
                  <Link
                    data-hit
                    href={`${recordBase}/${hit.id}`}
                    onClick={() => {
                      setOpen(false);
                      setQuery("");
                    }}
                    className="flex items-center gap-3 px-4 py-3 transition-colors outline-none hover:bg-canvas focus-visible:bg-primary-tint"
                  >
                    <PersonAvatar
                      id={hit.id}
                      name={hit.full_name}
                      className="size-10"
                    />
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-body font-semibold text-ink">
                        {hit.full_name}
                      </span>
                      <span className="truncate text-meta text-ink-muted">
                        {[personTitle(hit), hit.branch_name]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
