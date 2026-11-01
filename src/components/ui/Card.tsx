import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// §4 Card: surface, 1 px border, radius 24, padding 20 mobile / 24 desktop. No shadow.
export function Card({
  className,
  children,
  ...props
}: React.ComponentProps<"section">) {
  return (
    <section
      className={cn(
        "rounded-card border border-border bg-surface p-5 md:p-6",
        className,
      )}
      {...props}
    >
      {children}
    </section>
  );
}

/** Card title (h2) with an optional link or control on the right ("All approvals"). */
export function CardHeader({
  title,
  action,
  as: Heading = "h2",
  className,
}: {
  title: ReactNode;
  action?: ReactNode;
  as?: "h1" | "h2" | "h3";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1",
        className,
      )}
    >
      <Heading className="text-h2 text-ink">{title}</Heading>
      {action}
    </div>
  );
}
