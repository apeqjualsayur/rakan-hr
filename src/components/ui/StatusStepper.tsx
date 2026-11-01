import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { payrollSteps, type StatusOf } from "@/lib/status-styles";
import { cn } from "@/lib/utils";

// §4 Status stepper with fix §6.1: all 6 states on ONE row of equal segments.
// done = primary, current = accent (status colour, not a CTA), upcoming = border.
// Below 640 px only the current step's label is shown, as "Calculated · step 2 of 6".
export function StatusStepper({
  current,
  title,
  context,
  className,
}: {
  current: StatusOf<"payroll">;
  title?: ReactNode;
  context?: ReactNode;
  className?: string;
}) {
  const t = useTranslations("Status");
  const ts = useTranslations("Stepper");
  const currentIndex = payrollSteps.indexOf(current);

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {title || context ? (
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          {title ? <h2 className="text-h2 text-ink">{title}</h2> : null}
          {context ? (
            <p className="text-meta text-ink-muted">{context}</p>
          ) : null}
        </div>
      ) : null}

      <ol className="grid grid-cols-6 gap-2 sm:gap-3">
        {payrollSteps.map((step, index) => {
          const state =
            index < currentIndex
              ? "done"
              : index === currentIndex
                ? "current"
                : "upcoming";
          return (
            <li
              key={step}
              aria-current={state === "current" ? "step" : undefined}
              className="flex min-w-0 flex-col gap-2"
            >
              <span
                aria-hidden
                className={cn(
                  "h-2 rounded-full",
                  state === "done" && "bg-primary",
                  state === "current" && "bg-accent",
                  state === "upcoming" && "bg-border",
                )}
              />
              <span
                className={cn(
                  "truncate text-meta max-sm:sr-only",
                  state === "current"
                    ? "font-semibold text-ink"
                    : "text-ink-soft",
                )}
              >
                {t(`payroll.${step}`)}
                <span className="sr-only"> · {ts(state)}</span>
              </span>
            </li>
          );
        })}
      </ol>
      <p aria-hidden className="-mt-2 text-meta text-ink sm:hidden">
        <span className="font-semibold">{t(`payroll.${current}`)}</span>
        {" · "}
        {ts("stepOf", { step: currentIndex + 1, total: payrollSteps.length })}
      </p>
    </div>
  );
}
