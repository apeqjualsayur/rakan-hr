import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// §4 Hero card (desktop): primary fill, radius 32, white text.
// Meta line (date · branch) → display greeting → one-line summary; quick actions on the right.
// Quick actions are <Button variant="on-hero">. The mobile variant is <ShiftHeroCard>.
export function HeroCard({
  meta,
  greeting,
  summary,
  actions,
  className,
}: {
  meta: ReactNode;
  greeting: ReactNode;
  summary: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "flex flex-col gap-6 rounded-hero bg-primary px-6 py-8 text-white md:px-12 md:py-14 lg:flex-row lg:items-center lg:justify-between",
        className,
      )}
    >
      <div className="min-w-0">
        <p className="text-body text-white/90">{meta}</p>
        <h1 className="mt-1 text-display-sm md:text-display">{greeting}</h1>
        <p className="mt-2 text-body md:text-lg">{summary}</p>
      </div>
      {actions ? (
        <div className="flex flex-wrap gap-3 lg:justify-end">{actions}</div>
      ) : null}
    </section>
  );
}
