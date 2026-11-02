"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useErrorText } from "@/components/forms/FormFeedback";
import { Button } from "@/components/ui/button";
import { CategoryTag } from "@/components/ui/CategoryTag";
import { StatusChip } from "@/components/ui/StatusChip";
import { TextField } from "@/components/ui/TextField";
import { Link } from "@/i18n/navigation";
import { formatDate } from "@/lib/format";
import {
  changeCategory,
  describeChangeValue,
  type ChangeRequest,
} from "@/lib/people/changes";
import { bankName, type Bank } from "@/lib/people/records";
import type { FormState } from "@/lib/settings/form";
import { decideChange } from "./actions";

export type RequestView = ChangeRequest & {
  employeeName: string;
  /** Requested by the person viewing: they can't approve it themselves. */
  isOwn: boolean;
  comment: string | null;
};

// §4 Action row: category tag · who and what, old → new, the rule (bank flag) · decision.
export function RequestRow({
  request: r,
  banks,
  canDecide,
}: {
  request: RequestView;
  banks: readonly Bank[];
  canDecide: boolean;
}) {
  const t = useTranslations("People.requests");
  const ts = useTranslations("Status.changeRequest");
  const locale = useLocale();
  const errorText = useErrorText();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<FormState | null>(null);
  const bank = (code: string) => bankName(banks, code);
  const isBank = r.field === "bank_account";
  const when = (iso: string) => formatDate(new Date(iso), locale, "full");

  const decide = (decision: "approved" | "rejected") =>
    startTransition(async () =>
      setResult(await decideChange(r.approval_id!, decision, reason)),
    );

  return (
    <li className="flex flex-col gap-3 py-4 md:flex-row md:gap-6">
      <div className="md:w-40 md:shrink-0">
        <CategoryTag category={changeCategory(r.field)} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="text-h3 text-ink">
          {r.employeeName} · {t(`fields.${r.field}`)}
        </p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 text-meta">
          <dt className="text-ink-muted">{t("from")}</dt>
          <dd className="text-ink-soft">
            {describeChangeValue(r.field, r.old_value, bank) ?? t("empty")}
          </dd>
          <dt className="text-ink-muted">{t("to")}</dt>
          <dd className="font-medium text-ink">
            {describeChangeValue(r.field, r.new_value, bank) ?? t("empty")}
          </dd>
        </dl>
        {r.note ? (
          <p className="text-meta text-ink-soft">
            {t("note", { name: r.employeeName, note: r.note })}
          </p>
        ) : null}
        {isBank && r.status === "pending" ? (
          <p className="text-meta font-medium text-danger">{t("bankFlag")}</p>
        ) : null}
        <p className="text-meta text-ink-muted">
          {r.status === "pending"
            ? t("requested", { date: when(r.created_at) })
            : t("decidedOn", {
                status: ts(r.status),
                date: when(r.decided_at ?? r.created_at),
              })}
          {" · "}
          <Link
            href={`/admin/people/${r.employee_id}${isBank ? "?tab=bank" : ""}`}
            className="text-primary underline-offset-4 hover:underline"
          >
            {t("openRecord")}
          </Link>
        </p>
        {r.comment && r.status !== "pending" ? (
          <p className="text-meta text-ink-soft">“{r.comment}”</p>
        ) : null}

        {rejecting ? (
          <div className="mt-2 flex flex-col gap-3 rounded-tile border border-border bg-canvas p-4">
            <TextField
              label={t("rejectReason")}
              hint={t("rejectReasonHint")}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              error={
                result?.status === "error" && result.errors?.comment
                  ? errorText("required")
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
        {r.status === "pending" && r.isOwn ? (
          <p className="text-meta text-ink-muted">{t("ownRequest")}</p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-start gap-2 md:justify-end">
        {r.status !== "pending" ? (
          <StatusChip domain="changeRequest" status={r.status} />
        ) : canDecide && !r.isOwn && r.approval_id && !rejecting ? (
          <>
            <Button
              size="row"
              variant={isBank ? "danger-outline" : "primary"}
              loading={pending}
              onClick={() => decide("approved")}
            >
              {t("approve")}
            </Button>
            <Button
              variant="outline"
              size="row"
              disabled={pending}
              onClick={() => setRejecting(true)}
            >
              {t("reject")}
            </Button>
          </>
        ) : r.status === "pending" ? (
          <StatusChip domain="changeRequest" status="pending" />
        ) : null}
      </div>
    </li>
  );
}
