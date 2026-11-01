import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

// §4 Attention banner: warning-tint, radius 20, bold title + meta + chevron.
// The whole banner is one tap target.
export function AttentionBanner({
  title,
  meta,
  href,
  className,
}: {
  title: ReactNode;
  meta?: ReactNode;
  href: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-start gap-3 rounded-tile bg-warning-tint px-5 py-4 transition-[filter] hover:brightness-[0.97] active:brightness-95 md:px-6",
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="text-h3 font-bold text-ink">{title}</p>
        {meta ? <p className="mt-1 text-body text-warning">{meta}</p> : null}
      </div>
      <ChevronRight
        aria-hidden
        size={24}
        strokeWidth={2}
        className="mt-0.5 shrink-0 text-ink"
      />
    </Link>
  );
}
