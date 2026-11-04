"use client";

import { useTranslations } from "next-intl";
import { formatMoney } from "@/lib/format";
import type { OtCalculation } from "@/lib/time/types";
import { useOtLines } from "./OtBits";

/** How an approved OT amount was worked out (ORP / HRP and each rate line). */
export function OtLines({ calc }: { calc: OtCalculation | null }) {
  const t = useTranslations("Time.ot");
  const lines = useOtLines();
  if (!calc) return null;
  if (!calc.covered)
    return (
      <span className="text-meta text-ink-muted">
        {t(`notCovered.${calc.method as "none"}`)}
      </span>
    );
  return (
    <span className="flex flex-col text-meta text-ink-muted">
      <span>
        {t("basis", {
          orp: formatMoney(Number(calc.orp ?? 0)),
          hrp: formatMoney(Number(calc.hrp ?? 0)),
          hours: String(calc.normal_hours),
        })}
      </span>
      {lines(calc).map((l) => (
        <span key={l}>{l}</span>
      ))}
    </span>
  );
}
