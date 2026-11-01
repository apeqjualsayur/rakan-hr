"use client";

import { cn } from "@/lib/utils";

export type FilterChip<Value extends string> = {
  value: Value;
  label: string;
  count?: number;
};

// §4 Filter chips: selected = ink fill + white text; unselected = white + border.
// Counts are part of the label ("Action needed 2").
export function FilterChips<Value extends string>({
  chips,
  value,
  onChange,
  label,
  className,
}: {
  chips: FilterChip<Value>[];
  value: Value;
  onChange: (value: Value) => void;
  /** Accessible name for the group, e.g. "Filter credentials". */
  label: string;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        "-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0",
        className,
      )}
    >
      {chips.map((chip) => {
        const selected = chip.value === value;
        return (
          <button
            key={chip.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(chip.value)}
            className={cn(
              "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-4 text-body font-medium whitespace-nowrap transition-colors",
              selected
                ? "border-ink bg-ink text-white"
                : "border-border bg-surface text-ink hover:border-ink-muted active:bg-canvas",
            )}
          >
            {chip.label}
            {chip.count !== undefined ? (
              <span className="tabular-nums">{chip.count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
