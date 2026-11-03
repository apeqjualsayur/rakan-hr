"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useErrorText } from "@/components/forms/FormFeedback";
import { Button, buttonVariants } from "@/components/ui/button";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import { Link } from "@/i18n/navigation";
import {
  decideCredential,
  withdrawCredential,
} from "@/lib/credentials/actions";
import type { FormState } from "@/lib/settings/form";
import { cn } from "@/lib/utils";

/** Edit / withdraw while pending (CRD-08), renew once verified (CRD-07). */
export function OwnerActions({
  credentialId,
  editHref,
  renewHref,
  canEdit,
  canWithdraw,
}: {
  credentialId: string;
  editHref?: string;
  renewHref?: string;
  canEdit: boolean;
  canWithdraw: boolean;
}) {
  const t = useTranslations("Credentials.detail");
  const errorText = useErrorText();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<FormState | null>(null);
  if (!canEdit && !canWithdraw && !renewHref) return null;
  return (
    <div className="flex flex-col gap-2 pt-2">
      <div className="flex flex-wrap gap-2">
        {canEdit && editHref ? (
          <Link
            href={editHref}
            className={cn(buttonVariants({ variant: "outline", size: "row" }))}
          >
            {t("edit")}
          </Link>
        ) : null}
        {renewHref ? (
          <Link
            href={renewHref}
            className={cn(buttonVariants({ variant: "outline", size: "row" }))}
          >
            {t("renew")}
          </Link>
        ) : null}
        {canWithdraw ? (
          <Button
            variant="ghost"
            size="row"
            disabled={pending}
            onClick={() => {
              if (window.confirm(t("withdrawConfirm")))
                startTransition(async () =>
                  setResult(await withdrawCredential(credentialId)),
                );
            }}
          >
            {t("withdraw")}
          </Button>
        ) : null}
      </div>
      {result?.status === "error" ? (
        <p role="alert" className="text-meta font-medium text-danger">
          {errorText(result.message ?? "saveFailed")}
        </p>
      ) : null}
    </div>
  );
}

const METHODS = ["register", "original", "issuer", "other"] as const;

/** CRD-09: verify with the method used, or reject with a reason (owner / HR admin). */
export function DecisionPanel({ credentialId }: { credentialId: string }) {
  const t = useTranslations("Compliance.review");
  const errorText = useErrorText();
  const [method, setMethod] = useState<(typeof METHODS)[number]>("register");
  const [other, setOther] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<FormState | null>(null);

  const decide = (decision: "verified" | "rejected") =>
    startTransition(async () => {
      const note =
        decision === "rejected"
          ? reason
          : method === "other"
            ? other
            : t(`methods.${method}`);
      setResult(await decideCredential(credentialId, decision, note));
    });

  const fieldError =
    result?.status === "error" && result.errors?.note
      ? errorText(result.errors.note)
      : undefined;

  return (
    <div className="flex flex-col gap-4 border-t border-border pt-4">
      {rejecting ? (
        <>
          <TextField
            label={t("reason")}
            hint={t("reasonHint")}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            error={fieldError}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              variant="danger-outline"
              loading={pending}
              onClick={() => decide("rejected")}
            >
              {t("confirmReject")}
            </Button>
            <Button variant="ghost" onClick={() => setRejecting(false)}>
              {t("cancel")}
            </Button>
          </div>
        </>
      ) : (
        <>
          <SelectField
            label={t("method")}
            value={method}
            onChange={(e) =>
              setMethod(e.target.value as (typeof METHODS)[number])
            }
          >
            {METHODS.map((m) => (
              <option key={m} value={m}>
                {t(`methods.${m}`)}
              </option>
            ))}
          </SelectField>
          {method === "other" ? (
            <TextField
              label={t("methodOther")}
              value={other}
              onChange={(e) => setOther(e.target.value)}
              error={fieldError}
            />
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="accent"
              loading={pending}
              onClick={() => decide("verified")}
            >
              {t("verify")}
            </Button>
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => setRejecting(true)}
            >
              {t("reject")}
            </Button>
          </div>
        </>
      )}
      {result?.status === "error" && result.message ? (
        <p role="alert" className="text-meta font-medium text-danger">
          {errorText(result.message)}
        </p>
      ) : result?.status === "saved" ? (
        <p role="status" className="text-meta font-medium text-primary">
          {t("decided")}
        </p>
      ) : null}
    </div>
  );
}
