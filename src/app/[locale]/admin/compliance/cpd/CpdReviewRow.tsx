"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useErrorText } from "@/components/forms/FormFeedback";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/TextField";
import { cpdFileUrl, decideCpd } from "@/lib/credentials/actions";
import { dateFromIso, formatDate } from "@/lib/format";
import type { FormState } from "@/lib/settings/form";

export type CpdReview = {
  id: string;
  title: string;
  provider: string | null;
  activity_date: string;
  points: string;
  category: string;
  file_path: string | null;
  employeeName: string;
  typeName: string;
};

// CRD-18: HR verifies a CPD activity like a credential (reject needs a reason).
export function CpdReviewRow({ activity: a }: { activity: CpdReview }) {
  const t = useTranslations("Compliance.cpd");
  const tc = useTranslations("Credentials.cpd");
  const locale = useLocale();
  const errorText = useErrorText();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<FormState | null>(null);
  const decide = (decision: "verified" | "rejected") =>
    startTransition(async () =>
      setResult(await decideCpd(a.id, decision, reason)),
    );

  return (
    <li className="flex flex-col gap-3 py-4 md:flex-row md:items-start md:gap-6">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="text-h3 text-ink">
          {a.employeeName} · {a.title}
        </p>
        <p className="text-meta text-ink-muted">
          {[
            formatDate(dateFromIso(a.activity_date), locale, "full"),
            tc(`categories.${a.category}` as "categories.course"),
            tc("pointsMeta", { points: Number(a.points) }),
            a.provider,
            a.typeName,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {rejecting ? (
          <div className="mt-2 flex flex-col gap-3 rounded-tile border border-border bg-canvas p-4">
            <TextField
              label={t("reason")}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              error={
                result?.status === "error" && result.errors?.note
                  ? errorText(result.errors.note)
                  : undefined
              }
            />
            <div className="flex flex-wrap gap-2">
              <Button
                variant="danger-outline"
                size="row"
                loading={pending}
                onClick={() => decide("rejected")}
              >
                {t("confirmReject")}
              </Button>
              <Button
                variant="ghost"
                size="row"
                onClick={() => setRejecting(false)}
              >
                {t("cancel")}
              </Button>
            </div>
          </div>
        ) : null}
        {result?.status === "error" && result.message ? (
          <p role="alert" className="text-meta font-medium text-danger">
            {errorText(result.message)}
          </p>
        ) : null}
      </div>
      {rejecting ? null : (
        <div className="flex flex-wrap gap-2">
          {a.file_path ? (
            <Button
              variant="ghost"
              size="row"
              onClick={() => {
                const tab = window.open("", "_blank");
                startTransition(async () => {
                  const res = await cpdFileUrl(a.id);
                  if ("url" in res && tab) {
                    tab.opener = null;
                    tab.location.href = res.url;
                  } else tab?.close();
                });
              }}
            >
              {t("viewFile")}
            </Button>
          ) : (
            <span className="self-center text-meta text-ink-muted">
              {t("noFile")}
            </span>
          )}
          <Button
            size="row"
            loading={pending}
            onClick={() => decide("verified")}
          >
            {t("verify")}
          </Button>
          <Button
            variant="outline"
            size="row"
            disabled={pending}
            onClick={() => setRejecting(true)}
          >
            {t("reject")}
          </Button>
        </div>
      )}
    </li>
  );
}
