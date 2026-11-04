"use client";

import { useState, useTransition } from "react";
import { UserCheck } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useErrorText } from "@/components/forms/FormFeedback";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/TextField";
import { convertCandidate, moveCandidate } from "@/lib/hiring/actions";
import type { CandidateStage } from "@/lib/hiring/types";
import type { FormState } from "@/lib/settings/form";

// HIR-02: move a candidate between stages. Hired only comes from Convert to employee.
export function StageActions({
  candidateId,
  moves,
  accepted,
}: {
  candidateId: string;
  moves: readonly CandidateStage[];
  accepted: boolean;
}) {
  const t = useTranslations("Hiring.candidate");
  const ts = useTranslations("Status.candidate");
  const errorText = useErrorText();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [result, setResult] = useState<FormState | null>(null);
  const [pending, startTransition] = useTransition();
  const move = (stage: CandidateStage) =>
    startTransition(async () => {
      const r = await moveCandidate(candidateId, stage, reason);
      setResult(r);
      if (r.status === "saved") setRejecting(false);
    });

  if (moves.length === 0) return null;
  return (
    <div className="flex flex-col gap-3">
      {rejecting ? (
        <div className="flex flex-col gap-3 rounded-tile bg-danger-tint/40 p-4">
          <TextField
            label={t("rejectReason")}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
          />
          {accepted ? (
            <p className="text-meta text-danger">
              {t("rejectAcceptedWarning")}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="danger-outline"
              size="row"
              loading={pending}
              onClick={() => move("rejected")}
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
          {moves
            .filter((s) => s !== "rejected")
            .map((stage) => (
              <Button
                key={stage}
                type="button"
                variant="outline"
                size="row"
                disabled={pending}
                onClick={() => move(stage)}
              >
                {t("moveTo", { stage: ts(stage) })}
              </Button>
            ))}
          {moves.includes("rejected") ? (
            <Button
              type="button"
              variant="ghost"
              size="row"
              onClick={() => setRejecting(true)}
            >
              {t("reject")}
            </Button>
          ) : null}
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

// HIR-05: "Convert to employee".
export function ConvertButton({ candidateId }: { candidateId: string }) {
  const t = useTranslations("Hiring.convert");
  const locale = useLocale();
  const errorText = useErrorText();
  const [result, setResult] = useState<FormState | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        type="button"
        variant="accent"
        loading={pending}
        onClick={() =>
          startTransition(async () =>
            setResult(await convertCandidate(candidateId, locale)),
          )
        }
      >
        <UserCheck aria-hidden />
        {t("button")}
      </Button>
      {result?.status === "error" ? (
        <p role="alert" className="text-meta font-medium text-danger">
          {errorText(result.message ?? "saveFailed")}
        </p>
      ) : null}
    </div>
  );
}
