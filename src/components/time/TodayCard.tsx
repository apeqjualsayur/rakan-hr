"use client";

import { useEffect, useState, useTransition } from "react";
import { Camera, Clock } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useErrorText } from "@/components/forms/FormFeedback";
import { Button } from "@/components/ui/button";
import { LocationPill } from "@/components/ui/LocationPill";
import { ShiftHeroCard } from "@/components/ui/ShiftHeroCard";
import { formatClock, formatTime, malaysiaToday } from "@/lib/format";
import { clockIn, clockOut, geofenceStatus } from "@/lib/time/actions";
import { hhmm } from "@/lib/time/logic";
import type { Today } from "@/lib/time/types";
import { createClient } from "@/lib/supabase/client";
import type { ErrorKey } from "@/lib/settings/form";

type Fix = { lat: number; lng: number; accuracy: number } | null;

/** The phone's position, or null if it is refused or takes too long. */
function locate(): Promise<Fix> {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) =>
        resolve({
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          accuracy: Math.round(p.coords.accuracy),
        }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
    );
  });
}

// ATT-01 on the phone: today's shift, where you are against the branch's fence, Clock in
// (outside the fence asks for a reason) with an optional selfie, then Clock out.
export function TodayCard({
  today,
  tenantId,
  employeeId,
}: {
  today: Today;
  tenantId: string;
  employeeId: string;
}) {
  const t = useTranslations("Time.today");
  const locale = useLocale();
  const errorText = useErrorText();
  const [fix, setFix] = useState<Fix>(null);
  const [inside, setInside] = useState<boolean | null | undefined>(undefined);
  const [selfie, setSelfie] = useState<File | null>(null);
  const [error, setError] = useState<ErrorKey | null>(null);
  const [outReason, setOutReason] = useState("");
  const [askOut, setAskOut] = useState(false);
  const [pending, startTransition] = useTransition();
  const branchId = today.branch?.id ?? null;

  useEffect(() => {
    let live = true;
    locate().then(async (f) => {
      if (!live) return;
      setFix(f);
      if (!branchId || !today.branch?.has_fence) return setInside(null);
      const status = await geofenceStatus(
        branchId,
        f?.lat ?? null,
        f?.lng ?? null,
      );
      if (live) setInside(status?.inside ?? null);
    });
    return () => {
      live = false;
    };
  }, [branchId, today.branch?.has_fence]);

  const shift = today.shift;
  const timeRange = shift
    ? `${formatClock(hhmm(shift.start_time), locale)} – ${formatClock(hhmm(shift.end_time), locale)}`
    : t("noShift");
  const detail = shift
    ? [
        shift.room_or_service,
        shift.branch_name,
        shift.is_on_call ? t("onCall") : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : (today.branch?.name ?? "");

  const doClockIn = (reason?: string) =>
    startTransition(async () => {
      setError(null);
      let path: string | null = null;
      if (selfie) {
        path = `${tenantId}/${employeeId}/${malaysiaToday()}/${Date.now()}.jpg`;
        const { error: uploadError } = await createClient()
          .storage.from("selfies")
          .upload(path, selfie, { contentType: selfie.type, upsert: false });
        if (uploadError) path = null;
      }
      const result = await clockIn(
        fix?.lat ?? null,
        fix?.lng ?? null,
        fix?.accuracy ?? null,
        reason ?? null,
        path,
      );
      if (!result.ok) setError(result.error);
    });

  const doClockOut = () =>
    startTransition(async () => {
      setError(null);
      if (inside === false && !outReason.trim()) {
        setAskOut(true);
        return;
      }
      const result = await clockOut(
        fix?.lat ?? null,
        fix?.lng ?? null,
        fix?.accuracy ?? null,
        outReason.trim() || null,
      );
      if (!result.ok) setError(result.error);
    });

  if (inside === undefined)
    return (
      <section className="flex min-h-48 flex-col justify-center gap-2 rounded-hero bg-primary p-6 text-white">
        <p className="text-body text-white/90">{t("todaysShift")}</p>
        <p className="text-h2">{timeRange}</p>
        <p role="status" className="text-meta text-white/80">
          {t("locating")}
        </p>
      </section>
    );

  if (today.open)
    return (
      <section className="flex flex-col gap-5 rounded-hero bg-primary p-6 text-white">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-body text-white/90">{t("clockedInAt")}</p>
            <p className="text-display-sm tabular-nums">
              {formatTime(new Date(today.open.clock_in_at), locale)}
            </p>
            <p className="mt-1 text-body text-white/90">{timeRange}</p>
          </div>
          {inside !== null ? (
            <LocationPill state={inside ? "inside" : "outside"} />
          ) : null}
        </div>
        {askOut ? (
          <label className="flex flex-col gap-2 text-label">
            {t("outReason")}
            <textarea
              rows={2}
              value={outReason}
              onChange={(e) => setOutReason(e.target.value)}
              className="rounded-control bg-surface px-4 py-3 text-body text-ink outline-none"
            />
          </label>
        ) : null}
        <Button
          variant="accent"
          block
          className="h-14 text-lg"
          loading={pending}
          onClick={doClockOut}
        >
          <Clock aria-hidden className="size-6" strokeWidth={2} />
          {t("clockOut")}
        </Button>
        {error ? (
          <p
            role="alert"
            className="rounded-sm bg-surface px-2 py-1 text-meta font-medium text-danger"
          >
            {errorText(error)}
          </p>
        ) : null}
      </section>
    );

  return (
    <div className="flex flex-col gap-2">
      <ShiftHeroCard
        timeRange={timeRange}
        detail={detail}
        geofence={inside === false ? "outside" : "inside"}
        onClockIn={(reason) => doClockIn(reason)}
      />
      <div className="flex flex-wrap items-center gap-3 px-1">
        <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-label text-primary">
          <Camera aria-hidden size={20} strokeWidth={1.75} />
          {selfie ? t("selfieAdded") : t("addSelfie")}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="user"
            className="sr-only"
            onChange={(e) => setSelfie(e.target.files?.[0] ?? null)}
          />
        </label>
        {inside === null ? (
          <span className="text-meta text-ink-muted">
            {fix ? t("noFence") : t("noLocation")}
          </span>
        ) : null}
        {today.last?.clock_out_at ? (
          <span className="text-meta text-ink-muted">
            {t("lastOut", {
              time: formatTime(new Date(today.last.clock_out_at), locale),
            })}
          </span>
        ) : null}
      </div>
      {pending ? (
        <p role="status" className="px-1 text-meta text-ink-muted">
          {t("saving")}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="px-1 text-meta font-medium text-danger">
          {errorText(error)}
        </p>
      ) : null}
    </div>
  );
}
