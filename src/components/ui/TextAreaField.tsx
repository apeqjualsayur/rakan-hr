import { useId, type ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

// Label + multi-line text + hint, styled like TextField (§4.1 error under the field).
export function TextAreaField({
  label,
  hint,
  error,
  className,
  textareaClassName,
  ...props
}: Omit<React.ComponentProps<"textarea">, "id"> & {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  textareaClassName?: string;
}) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Label htmlFor={id}>{label}</Label>
      <textarea
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(
          "min-h-24 w-full rounded-control border border-border bg-surface px-4 py-3 text-body text-ink transition-colors outline-none hover:border-ink-muted focus-visible:border-primary disabled:opacity-40 aria-invalid:border-danger",
          textareaClassName,
        )}
        {...props}
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
