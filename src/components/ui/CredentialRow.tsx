import { ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusChip } from "@/components/ui/StatusChip";
import {
  statusTone,
  toneLinkClasses,
  toneTileClasses,
  type StatusOf,
} from "@/lib/status-styles";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

// §4 Credential row: status-tinted shield tile · title + meta · chip top-right ·
// action link bottom-right, coloured by status (Renew now = danger, Renew = warning,
// View / Add = primary).
export function CredentialRow({
  title,
  meta,
  status,
  actionLabel,
  actionHref,
  className,
}: {
  title: ReactNode;
  meta: ReactNode;
  status: StatusOf<"credential">;
  actionLabel: string;
  actionHref: string;
  className?: string;
}) {
  const tone = statusTone("credential", status);
  // The link follows the chip colour, as in the reference; "Add" on a missing
  // (neutral) credential uses primary instead of grey.
  const linkTone = tone === "neutral" ? "primary" : tone;
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-card border border-border bg-surface p-4 min-[380px]:gap-4 md:p-5",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "grid size-12 shrink-0 place-items-center rounded-control",
          toneTileClasses[tone],
        )}
      >
        <ShieldCheck size={24} strokeWidth={1.75} />
      </span>
      {/* Two rows (title | chip, meta | link) so the chip only narrows the
          title line, not the meta line, on small phones. */}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 text-h3 font-medium text-ink">{title}</p>
          <StatusChip domain="credential" status={status} />
        </div>
        <div className="flex items-end justify-between gap-3">
          <p className="min-w-0 text-meta text-ink-muted">{meta}</p>
          <Link
            href={actionHref}
            className={cn(
              "-mb-1 inline-flex min-h-8 shrink-0 items-center rounded-sm text-label font-bold whitespace-nowrap underline-offset-4 hover:underline",
              toneLinkClasses[linkTone],
            )}
          >
            {actionLabel}
          </Link>
        </div>
      </div>
    </div>
  );
}

export function CredentialRowSkeleton() {
  return (
    <div className="flex items-center gap-4 rounded-card border border-border bg-surface p-4 md:p-5">
      <Skeleton className="size-12" />
      <div className="flex flex-1 flex-col gap-2">
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
      </div>
      <div className="flex flex-col items-end gap-2">
        <Skeleton className="h-7 w-20 rounded-full" />
        <Skeleton className="h-4 w-14" />
      </div>
    </div>
  );
}
