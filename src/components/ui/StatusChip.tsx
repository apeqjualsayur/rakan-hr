import { useTranslations } from "next-intl";
import {
  statusLabelKey,
  statusTone,
  toneClasses,
  type StatusDomain,
  type StatusOf,
} from "@/lib/status-styles";
import { cn } from "@/lib/utils";

// §4 Status chip: always shows the word, never colour alone (§1.5).
export function StatusChip<D extends StatusDomain>({
  domain,
  status,
  short = false,
  className,
}: {
  domain: D;
  status: StatusOf<D>;
  /** Shorter label for tight side cards ("Expiring" instead of "Expiring soon"). */
  short?: boolean;
  className?: string;
}) {
  const t = useTranslations("Status");
  // Keys are built from status-styles.ts; status-styles.test.ts checks that each
  // one exists in both message files, so the loose key type is safe here.
  type Key = Parameters<typeof t>[0];
  const key = statusLabelKey(domain, status) as Key;
  const shortKey = `short.${key}` as Key;
  const label = short && t.has(shortKey) ? t(shortKey) : t(key);
  return (
    <span
      className={cn(
        "inline-flex min-h-7 shrink-0 items-center rounded-full px-3 py-0.5 text-label whitespace-nowrap",
        toneClasses[statusTone(domain, status)],
        className,
      )}
    >
      {label}
    </span>
  );
}
