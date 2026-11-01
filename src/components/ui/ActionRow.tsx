import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// §4 Action row: tag or icon tile · title + meta · one action on the right.
// Rows sit in a list separated by 1 px border dividers (use <ActionList>).
export function ActionRow({
  lead,
  title,
  meta,
  action,
  className,
}: {
  lead: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <li
      className={cn(
        "grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 py-4 md:grid-cols-[9.5rem_1fr_auto] md:gap-x-6",
        className,
      )}
    >
      <div className="col-span-2 md:col-span-1">{lead}</div>
      <div className="min-w-0">
        <p className="text-h3 font-medium text-ink">{title}</p>
        {meta ? (
          <p className="mt-0.5 text-meta text-ink-muted">{meta}</p>
        ) : null}
      </div>
      {action ? <div className="justify-self-end">{action}</div> : null}
    </li>
  );
}

export function ActionList({
  className,
  ...props
}: React.ComponentProps<"ul">) {
  return (
    <ul
      className={cn("divide-y divide-border border-t border-border", className)}
      {...props}
    />
  );
}

export function ActionRowSkeleton() {
  return (
    <li className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 py-4 md:grid-cols-[9.5rem_1fr_auto] md:gap-x-6">
      <Skeleton className="col-span-2 h-8 w-28 rounded-full md:col-span-1" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </div>
      <Skeleton className="h-11 w-28" />
    </li>
  );
}
