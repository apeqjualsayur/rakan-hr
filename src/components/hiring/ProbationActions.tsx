"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useErrorText } from "@/components/forms/FormFeedback";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/TextField";
import {
  decideProbationReview,
  retryProbationLetter,
} from "@/lib/hiring/actions";
import type { FormState } from "@/lib/settings/form";

// HIR-07 Owner approval of a submitted review (a comment is needed to reject).
export function ProbationDecision({ approvalId }: { approvalId: string }) {
  const t = useTranslations("Probation.decide");
  const errorText = useErrorText();
  const [comment, setComment] = useState("");
  const [result, setResult] = useState<FormState | null>(null);
  const [pending, startTransition] = useTransition();
  const decide = (decision: "approved" | "rejected") =>
    startTransition(async () =>
      setResult(await decideProbationReview(approvalId, decision, comment)),
    );
  return (
    <div className="flex flex-col gap-3 border-t border-border pt-4">
      <TextField
        label={t("comment")}
        hint={t("commentHint")}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        maxLength={500}
      />
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="accent"
          loading={pending}
          onClick={() => decide("approved")}
        >
          {t("approve")}
        </Button>
        <Button
          type="button"
          variant="danger-outline"
          disabled={pending}
          onClick={() => decide("rejected")}
        >
          {t("reject")}
        </Button>
      </div>
      {result?.status === "error" ? (
        <p role="alert" className="text-meta font-medium text-danger">
          {errorText(result.message ?? "saveFailed")}
        </p>
      ) : null}
    </div>
  );
}

/** The letter could not be written (e.g. email service not set up yet): try again. */
export function RetryLetterButton({ reviewId }: { reviewId: string }) {
  const t = useTranslations("Probation");
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      variant="outline"
      size="row"
      loading={pending}
      onClick={() =>
        startTransition(async () => void (await retryProbationLetter(reviewId)))
      }
    >
      {t("retryLetter")}
    </Button>
  );
}
