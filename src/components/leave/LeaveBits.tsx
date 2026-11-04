"use client";

import { useState, useTransition } from "react";
import { Paperclip } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useErrorText } from "@/components/forms/FormFeedback";
import { Button } from "@/components/ui/button";
import { StatusChip } from "@/components/ui/StatusChip";
import { TextField } from "@/components/ui/TextField";
import { dateFromIso, formatDate } from "@/lib/format";
import { attachmentUrl, cancelLeave, decideLeave } from "@/lib/leave/actions";
import { days as fmt } from "@/lib/leave/logic";
import type { LeaveRequest } from "@/lib/leave/types";
import type { FormState } from "@/lib/settings/form";

/** "3–4 Nov" / "3 Nov (morning)" in the reader's language. */
export function useLeaveDates() {
  const t = useTranslations("Leave");
  const locale = useLocale();
  return (r: {
    start_date: string;
    end_date: string;
    half_day?: string | null;
  }) => {
    const a = formatDate(dateFromIso(r.start_date), locale, "short");
    if (r.start_date === r.end_date)
      return r.half_day
        ? `${a} (${t(`apply.${r.half_day as "am" | "pm"}`)})`
        : a;
    return `${a} – ${formatDate(dateFromIso(r.end_date), locale, "short")}`;
  };
}

/** Own leave requests, newest first, with cancel for those still open. */
export function MyRequests({
  requests,
  typeNames,
}: {
  requests: readonly LeaveRequest[];
  typeNames: Record<string, string>;
}) {
  const t = useTranslations("Leave");
  const dates = useLeaveDates();
  const errorText = useErrorText();
  const [result, setResult] = useState<FormState | null>(null);
  const [pending, startTransition] = useTransition();
  if (requests.length === 0)
    return <p className="text-body text-ink-muted">{t("noRequests")}</p>;
  return (
    <ul className="flex flex-col divide-y divide-border">
      {requests.map((r) => (
        <li key={r.id} className="flex flex-wrap items-center gap-3 py-3">
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-body font-medium text-ink">
              {typeNames[r.leave_type_id]} · {dates(r)}
            </span>
            <span className="text-meta text-ink-muted">
              {t("daysCount", { days: fmt(r.days) })}
              {r.decision_comment ? ` · ${r.decision_comment}` : ""}
            </span>
          </span>
          <StatusChip domain="leave" status={r.status} />
          {r.status === "pending" ? (
            <Button
              type="button"
              variant="ghost"
              size="row"
              disabled={pending}
              onClick={() =>
                startTransition(async () => setResult(await cancelLeave(r.id)))
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

/** Approve / reject a leave request (comment required to reject). */
export function LeaveDecision({ approvalId }: { approvalId: string }) {
  const t = useTranslations("Leave.decide");
  const errorText = useErrorText();
  const [rejecting, setRejecting] = useState(false);
  const [comment, setComment] = useState("");
  const [result, setResult] = useState<FormState | null>(null);
  const [pending, startTransition] = useTransition();
  const decide = (decision: "approved" | "rejected") =>
    startTransition(async () =>
      setResult(await decideLeave(approvalId, decision, comment)),
    );
  return (
    <div className="flex flex-col gap-2">
      {rejecting ? (
        <div className="flex flex-col gap-2">
          <TextField
            label={t("reason")}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={300}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="danger-outline"
              size="row"
              loading={pending}
              onClick={() => decide("rejected")}
            >
              {t("confirmReject")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="row"
              onClick={() => setRejecting(false)}
            >
              {t("cancel")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="row"
            loading={pending}
            onClick={() => decide("approved")}
          >
            {t("approve")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="row"
            onClick={() => setRejecting(true)}
          >
            {t("reject")}
          </Button>
        </div>
      )}
      {result?.status === "error" ? (
        <p role="alert" className="text-meta font-medium text-danger">
          {errorText(result.message ?? "saveFailed")}
        </p>
      ) : null}
    </div>
  );
}

/** Opens a medical certificate through a 5-minute link. */
export function AttachmentButton({ requestId }: { requestId: string }) {
  const t = useTranslations("Leave");
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
          const result = await attachmentUrl(requestId);
          if ("url" in result && tab) tab.location.href = result.url;
          else tab?.close();
        })
      }
    >
      <Paperclip aria-hidden />
      {t("certificate")}
    </Button>
  );
}

/** HR cancels approved leave (unpaid-leave payroll inputs go too). */
export function CancelApprovedButton({ requestId }: { requestId: string }) {
  const t = useTranslations("Leave");
  const errorText = useErrorText();
  const [confirm, setConfirm] = useState(false);
  const [result, setResult] = useState<FormState | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <span className="flex flex-col gap-1">
      {confirm ? (
        <span className="flex gap-2">
          <Button
            type="button"
            variant="danger-outline"
            size="row"
            loading={pending}
            onClick={() =>
              startTransition(async () =>
                setResult(await cancelLeave(requestId)),
              )
            }
          >
            {t("confirmCancel")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="row"
            onClick={() => setConfirm(false)}
          >
            {t("keep")}
          </Button>
        </span>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="row"
          onClick={() => setConfirm(true)}
        >
          {t("cancel")}
        </Button>
      )}
      {result?.status === "error" ? (
        <span role="alert" className="text-meta text-danger">
          {errorText(result.message ?? "saveFailed")}
        </span>
      ) : null}
    </span>
  );
}
