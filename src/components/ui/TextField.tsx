import { useId, type ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

// Label + input + hint, with §4.1 error: inline danger text under the field.
export function TextField({
  label,
  hint,
  error,
  className,
  ...inputProps
}: Omit<React.ComponentProps<"input">, "id"> & {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
}) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...inputProps}
      />
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
