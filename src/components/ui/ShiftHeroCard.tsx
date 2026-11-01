"use client";

import { Clock } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { LocationPill, type GeofenceState } from "@/components/ui/LocationPill";
import { cn } from "@/lib/utils";

// §4 Hero card, mobile variant: today's shift + location pill + full-width accent button.
// Fix §6.2: the time range never wraps; it steps down to 28 px below 380 px wide.
// Fix §6.3: outside the geofence, Clock in stays enabled but asks for a reason (ATT-01).
// Clock-in itself is built in step 10; this component only collects the reason.
export function ShiftHeroCard({
  timeRange,
  detail,
  geofence,
  onClockIn,
  className,
}: {
  /** e.g. "8:30 am – 5:30 pm" (en dash). */
  timeRange: string;
  /** e.g. "Speech therapy · Room 2". */
  detail: ReactNode;
  geofence: GeofenceState;
  onClockIn?: (reason?: string) => void;
  className?: string;
}) {
  const t = useTranslations("Shift");
  const reasonId = useId();
  const [askingReason, setAskingReason] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState(false);

  function handleClockIn() {
    if (geofence === "inside") return onClockIn?.();
    if (!askingReason) return setAskingReason(true);
    if (!reason.trim()) return setError(true);
    onClockIn?.(reason.trim());
  }

  return (
    <section
      className={cn(
        "flex flex-col gap-6 rounded-hero bg-primary p-5 text-white min-[380px]:p-6",
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-body text-white/90">{t("todaysShift")}</p>
          <p className="text-[1.75rem] leading-9 font-bold tracking-tight whitespace-nowrap tabular-nums min-[380px]:text-display-sm">
            {timeRange}
          </p>
          <p className="mt-1 text-body text-white/90">{detail}</p>
        </div>
        <LocationPill state={geofence} />
      </div>

      {askingReason ? (
        <div className="flex flex-col gap-2">
          <label htmlFor={reasonId} className="text-label">
            {t("reasonLabel")}
          </label>
          <textarea
            id={reasonId}
            rows={2}
            value={reason}
            aria-invalid={error || undefined}
            aria-describedby={error ? `${reasonId}-error` : undefined}
            onChange={(e) => {
              setReason(e.target.value);
              setError(false);
            }}
            className="rounded-control border border-transparent bg-surface px-4 py-3 text-body text-ink outline-none placeholder:text-ink-muted aria-invalid:border-danger"
            placeholder={t("reasonPlaceholder")}
          />
          {error ? (
            <p
              id={`${reasonId}-error`}
              className="rounded-sm bg-surface px-2 py-1 text-meta font-medium text-danger"
            >
              {t("reasonRequired")}
            </p>
          ) : null}
        </div>
      ) : null}

      <Button
        variant="accent"
        block
        onClick={handleClockIn}
        className="h-14 text-lg"
      >
        <Clock aria-hidden className="size-6" strokeWidth={2} />
        {askingReason ? t("clockInWithReason") : t("clockIn")}
      </Button>
    </section>
  );
}
