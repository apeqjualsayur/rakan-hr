import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// §4 Progress bar: 8 px, pill radius, primary on track; label left + "5 of 7" right.
export function ProgressBar({
  value,
  max,
  label,
  valueLabel,
  hideLabels = false,
  className,
}: {
  value: number;
  max: number;
  /** Visible label on the left. */
  label?: ReactNode;
  /** Text on the right, e.g. "5 of 7". Also read out by screen readers. */
  valueLabel?: string;
  /** Bar only (the numbers are already shown nearby, e.g. in a stat card). */
  hideLabels?: boolean;
  className?: string;
}) {
  const percent = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {!hideLabels && (label || valueLabel) ? (
        <div className="flex items-baseline justify-between gap-4">
          {label ? (
            <span className="text-h3 font-medium text-ink">{label}</span>
          ) : (
            <span />
          )}
          {valueLabel ? (
            <span className="text-h3 font-medium text-ink tabular-nums">
              {valueLabel}
            </span>
          ) : null}
        </div>
      ) : null}
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={valueLabel}
        className="h-2 overflow-hidden rounded-full bg-track"
      >
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
