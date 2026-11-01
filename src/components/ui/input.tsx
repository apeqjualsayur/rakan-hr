import * as React from "react";
import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-12 w-full min-w-0 rounded-control border border-border bg-surface px-4 text-body text-ink transition-colors outline-none placeholder:text-ink-muted hover:border-ink-muted focus-visible:border-primary disabled:pointer-events-none disabled:opacity-40 aria-invalid:border-danger",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
