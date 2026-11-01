import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// §4 Stat card: small meta label, stat number, optional unit ("of 8 days"),
// optional footer (progress bar or a meta line such as "Sep 2026 · paid 30 Sep").
export function StatCard({
  label,
  value,
  unit,
  footer,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  unit?: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "@container flex min-w-0 flex-col gap-1 rounded-card border border-border bg-surface p-4 min-[380px]:p-5 md:p-6",
        className,
      )}
    >
      <p className="text-meta text-ink-muted">{label}</p>
      <p className="flex flex-wrap items-baseline gap-x-1.5">
        {/* Scales with the card's width (stat 36 px at most) so "RM 3,354.65"
            stays on one line in a half-width card on a 375 px phone. */}
        <span className="text-[clamp(1.125rem,14.5cqi,2.25rem)] leading-[1.15] font-bold tracking-tight whitespace-nowrap text-ink tabular-nums">
          {value}
        </span>
        {unit ? (
          <span className="text-h3 font-semibold text-ink-soft">{unit}</span>
        ) : null}
      </p>
      {footer ? (
        <div className="mt-2 text-meta text-ink-muted">{footer}</div>
      ) : null}
    </div>
  );
}

export function StatCardSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-card border border-border bg-surface p-5 md:p-6",
        className,
      )}
    >
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-10 w-32" />
      <Skeleton className="h-2 w-full rounded-full" />
    </div>
  );
}
