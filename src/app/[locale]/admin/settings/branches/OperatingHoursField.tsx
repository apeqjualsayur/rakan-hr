"use client";

import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { DAYS, type Day, type OperatingHours } from "@/lib/settings/branch";
import { cn } from "@/lib/utils";

const DEFAULT_OPENING = { open: "08:30", close: "17:30" };

// ORG-03 operating hours: one opening per day (open / closed + times). The value is
// sent as JSON in a hidden `operating_hours` field; the server validates it.
export function OperatingHoursField({
  value,
  onChange,
  disabled,
  error,
}: {
  value: OperatingHours;
  onChange: (hours: OperatingHours) => void;
  disabled?: boolean;
  error?: string;
}) {
  const t = useTranslations("Settings.branches");

  const setDay = (
    day: Day,
    opening: { open: string; close: string } | null,
  ) => {
    const next = { ...value };
    if (opening) next[day] = [opening];
    else delete next[day];
    onChange(next);
  };

  return (
    <fieldset className="flex flex-col gap-3" disabled={disabled}>
      <legend className="sr-only">{t("hours")}</legend>
      <input
        type="hidden"
        name="operating_hours"
        value={JSON.stringify(value)}
      />
      <ul className="flex flex-col divide-y divide-border">
        {DAYS.map((day) => {
          const opening = value[day]?.[0];
          const invalid = opening ? opening.close <= opening.open : false;
          return (
            <li
              key={day}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 py-3 md:grid-cols-[180px_auto_minmax(0,1fr)]"
            >
              <span className="text-body font-medium text-ink">
                {t(`days.${day}`)}
              </span>
              <label className="flex min-h-11 cursor-pointer items-center gap-2 text-body text-ink-soft">
                <input
                  type="checkbox"
                  checked={Boolean(opening)}
                  onChange={(e) =>
                    setDay(day, e.target.checked ? DEFAULT_OPENING : null)
                  }
                  className="size-5 accent-primary"
                />
                {opening ? t("open") : t("closed")}
              </label>
              {opening ? (
                <div className="col-span-2 flex flex-wrap items-center gap-2 md:col-span-1">
                  <Input
                    type="time"
                    aria-label={`${t(`days.${day}`)} · ${t("opens")}`}
                    value={opening.open}
                    onChange={(e) =>
                      setDay(day, { ...opening, open: e.target.value })
                    }
                    className={cn("w-36", invalid && "border-danger")}
                    required
                  />
                  <span aria-hidden className="text-ink-muted">
                    –
                  </span>
                  <Input
                    type="time"
                    aria-label={`${t(`days.${day}`)} · ${t("closes")}`}
                    value={opening.close}
                    aria-invalid={invalid || undefined}
                    onChange={(e) =>
                      setDay(day, { ...opening, close: e.target.value })
                    }
                    className="w-36"
                    required
                  />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      {error ? (
        <p className="text-meta font-medium text-danger">{error}</p>
      ) : null}
    </fieldset>
  );
}
