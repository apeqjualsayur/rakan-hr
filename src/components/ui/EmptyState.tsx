import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// §4.1 empty: no illustration — one line of ink-muted text + one action.
export function EmptyState({
  message,
  action,
  className,
}: {
  message: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-start gap-3 py-6", className)}>
      <p className="text-body text-ink-muted">{message}</p>
      {action}
    </div>
  );
}
