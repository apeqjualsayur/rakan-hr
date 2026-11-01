import { useLocale } from "next-intl";
import { dateTileParts } from "@/lib/format";
import { cn } from "@/lib/utils";

// §4 Date tile: 72 px square, primary-tint, radius 14, month (label, caps) over day (h2).
export function DateTile({
  date,
  className,
}: {
  date: Date;
  className?: string;
}) {
  const locale = useLocale();
  const { month, day } = dateTileParts(date, locale);
  return (
    <div
      className={cn(
        "flex size-18 shrink-0 flex-col items-center justify-center rounded-control bg-primary-tint text-primary-strong",
        className,
      )}
    >
      <span className="text-label">{month}</span>
      <span className="text-h2 font-bold tabular-nums">{day}</span>
    </div>
  );
}
