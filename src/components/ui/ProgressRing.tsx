import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// §4 Progress ring: 8–10 px stroke, primary on track, % centred.
// Text block to the right: headline + one explanatory line.
export function ProgressRing({
  percent,
  size = 120,
  headline,
  body,
  className,
}: {
  percent: number;
  size?: number;
  headline?: ReactNode;
  body?: ReactNode;
  className?: string;
}) {
  const clamped = Math.min(100, Math.max(0, Math.round(percent)));
  const stroke = size >= 100 ? 10 : 8;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  return (
    <div className={cn("flex items-center gap-5", className)}>
      <div
        role="img"
        aria-label={`${clamped}%`}
        className="relative shrink-0"
        style={{ width: size, height: size }}
      >
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="-rotate-90"
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={stroke}
            className="stroke-track"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - clamped / 100)}
            className="stroke-primary"
          />
        </svg>
        <span
          aria-hidden
          className={cn(
            "absolute inset-0 grid place-items-center font-bold tracking-tight text-ink tabular-nums",
            size >= 100 ? "text-stat" : "text-h2",
          )}
        >
          {clamped}%
        </span>
      </div>
      {headline || body ? (
        <div className="min-w-0">
          {headline ? (
            <p className="text-h3 text-ink md:text-h2">{headline}</p>
          ) : null}
          {body ? (
            <p className="mt-1 text-body text-ink-muted">{body}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
