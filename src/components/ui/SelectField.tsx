import { useId, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

// Native <select> styled like Input (works with phone pickers and screen readers).
export function Select({
  className,
  children,
  ...props
}: React.ComponentProps<"select">) {
  return (
    <div className={cn("relative", className)}>
      <select
        data-slot="select"
        className="h-12 w-full min-w-0 cursor-pointer appearance-none rounded-control border border-border bg-surface pr-11 pl-4 text-body text-ink transition-colors outline-none hover:border-ink-muted focus-visible:border-primary disabled:pointer-events-none disabled:opacity-40 aria-invalid:border-danger"
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden
        size={20}
        strokeWidth={1.75}
        className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-ink-muted"
      />
    </div>
  );
}

// Label + select + hint, with §4.1 error: inline danger text under the field.
export function SelectField({
  label,
  hint,
  error,
  className,
  children,
  ...selectProps
}: Omit<React.ComponentProps<"select">, "id"> & {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
}) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Label htmlFor={id}>{label}</Label>
      <Select
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...selectProps}
      >
        {children}
      </Select>
      {error ? (
        <p id={`${id}-error`} className="text-meta font-medium text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-meta text-ink-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
