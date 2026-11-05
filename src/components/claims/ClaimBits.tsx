"use client";

import { useState, useTransition } from "react";
import { Receipt } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useErrorText } from "@/components/forms/FormFeedback";
import { Button } from "@/components/ui/button";
import { StatusChip } from "@/components/ui/StatusChip";
import { cancelClaim, receiptUrls } from "@/lib/claims/actions";
import type { Claim } from "@/lib/claims/types";
import { dateFromIso, formatDate, formatMoney } from "@/lib/format";
import type { FormState } from "@/lib/settings/form";

/** Opens a claim's receipts (5-minute links), one tab each. */
export function ReceiptsButton({ claimId }: { claimId: string }) {
  const t = useTranslations("Claims");
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      variant="ghost"
      size="row"
      loading={pending}
      onClick={() =>
        startTransition(async () => {
          const tab = window.open("", "_blank");
          const urls = await receiptUrls(claimId);
          if (urls.length && tab) {
            tab.location.href = urls[0]!;
            for (const url of urls.slice(1)) window.open(url, "_blank");
          } else tab?.close();
        })
      }
    >
      <Receipt aria-hidden />
      {t("receipts")}
    </Button>
  );
}

/** Own claims with status; cancel while pending (HR: also approved, not yet paid). */
export function ClaimList({
  claims,
  typeNames,
  canCancelApproved = false,
}: {
  claims: readonly Claim[];
  typeNames: Record<string, string>;
  canCancelApproved?: boolean;
}) {
  const t = useTranslations("Claims");
  const locale = useLocale();
  const errorText = useErrorText();
  const [result, setResult] = useState<FormState | null>(null);
  const [pending, startTransition] = useTransition();
  if (claims.length === 0)
    return <p className="text-body text-ink-muted">{t("none")}</p>;
  return (
    <ul className="flex flex-col divide-y divide-border">
      {claims.map((c) => (
        <li key={c.id} className="flex flex-wrap items-center gap-3 py-3">
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-body font-medium text-ink">
              {typeNames[c.claim_type_id]} · {formatMoney(c.amount)}
            </span>
            <span className="text-meta text-ink-muted">
              {[
                formatDate(dateFromIso(c.expense_date), locale, "full"),
                c.distance_km ? t("km", { km: Number(c.distance_km) }) : null,
                c.description,
                c.decision_comment,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </span>
          <StatusChip
            domain="claim"
            status={c.payroll_run_id ? "paid" : c.status}
          />
          {c.status === "pending" ||
          (canCancelApproved &&
            c.status === "approved" &&
            !c.payroll_run_id) ? (
            <Button
              type="button"
              variant="ghost"
              size="row"
              disabled={pending}
              onClick={() =>
                startTransition(async () => setResult(await cancelClaim(c.id)))
              }
            >
              {t("cancel")}
            </Button>
          ) : null}
        </li>
      ))}
      {result?.status === "error" ? (
        <li role="alert" className="py-2 text-meta font-medium text-danger">
          {errorText(result.message ?? "saveFailed")}
        </li>
      ) : null}
    </ul>
  );
}
