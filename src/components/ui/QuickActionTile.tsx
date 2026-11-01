import type { LucideIcon } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

// §4 Quick-action tile: white, radius 20, 1 px border, 24 px primary icon over label.
// Four across on mobile (wrap them in a 4-column grid).
export function QuickActionTile({
  icon: Icon,
  label,
  href,
  disabled = false,
  className,
}: {
  icon: LucideIcon;
  label: string;
  href?: string;
  disabled?: boolean;
  className?: string;
}) {
  const classes = cn(
    "flex min-h-24 min-w-0 flex-col items-center justify-center gap-2 rounded-tile border border-border bg-surface px-1 py-3 text-center text-label text-ink transition-colors hover:border-primary/40 hover:bg-primary-tint/40 active:bg-primary-tint",
    disabled && "pointer-events-none opacity-40",
    className,
  );
  const content = (
    <>
      <Icon aria-hidden size={24} strokeWidth={1.75} className="text-primary" />
      <span className="max-w-full text-[0.8125rem] leading-tight break-words min-[380px]:text-label">
        {label}
      </span>
    </>
  );
  return href && !disabled ? (
    <Link href={href} className={classes}>
      {content}
    </Link>
  ) : (
    <button type="button" disabled={disabled} className={classes}>
      {content}
    </button>
  );
}
