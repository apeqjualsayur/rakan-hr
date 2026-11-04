"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { FormFeedback, useFieldError } from "@/components/forms/FormFeedback";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/Card";
import { TextAreaField } from "@/components/ui/TextAreaField";
import { TextField } from "@/components/ui/TextField";
import { submitProbationReview } from "@/lib/hiring/actions";
import { PROBATION_CRITERIA, RECOMMENDATIONS } from "@/lib/hiring/types";
import { idle } from "@/lib/settings/form";
import { useFormAction } from "@/lib/use-form-action";
import { cn } from "@/lib/utils";

// HIR-07 review form: five criteria rated 1–5, comments and a recommendation. Used by the
// manager (staff app) and by HR / the owner (employee record). The Owner approves it.
export function ProbationReviewForm({
  employeeId,
  employeeName,
  approvalNote,
}: {
  employeeId: string;
  employeeName: string;
  /** "Goes to the Owner for approval" or "Your review is final" (owner). */
  approvalNote: string;
}) {
  const t = useTranslations("Probation.form");
  const { state, onSubmit, pending } = useFormAction(
    submitProbationReview,
    idle,
  );
  const error = useFieldError(state);
  const [recommendation, setRecommendation] = useState("");

  if (state.status === "saved")
    return (
      <Card>
        <p role="status" className="text-body font-medium text-primary">
          {t("submitted")}
        </p>
      </Card>
    );

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="employee_id" value={employeeId} />
      <Card className="flex flex-col gap-5">
        <CardHeader title={t("title", { name: employeeName })} />
        <p className="-mt-2 text-meta text-ink-muted">{t("intro")}</p>
        {PROBATION_CRITERIA.map((criterion) => (
          <fieldset key={criterion} className="flex flex-col gap-2">
            <legend className="text-label text-ink">
              {t(`criteria.${criterion}.label`)}
            </legend>
            <p className="text-meta text-ink-muted">
              {t(`criteria.${criterion}.hint`)}
            </p>
            <div className="flex flex-wrap gap-2">
              {[1, 2, 3, 4, 5].map((score) => (
                <label key={score} className="cursor-pointer">
                  <input
                    type="radio"
                    name={`rating_${criterion}`}
                    value={score}
                    className="peer sr-only"
                  />
                  <span
                    className={cn(
                      "flex min-h-11 min-w-11 items-center justify-center rounded-full border border-border bg-surface px-3 text-body text-ink tabular-nums transition-colors",
                      "peer-checked:border-primary peer-checked:bg-primary peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-primary",
                    )}
                  >
                    {score}
                  </span>
                </label>
              ))}
            </div>
            <p className="text-meta text-ink-muted">{t("scale")}</p>
            {error(`rating_${criterion}`) ? (
              <p className="text-meta font-medium text-danger">
                {error(`rating_${criterion}`)}
              </p>
            ) : null}
          </fieldset>
        ))}
        <TextAreaField
          label={t("comments")}
          name="comments"
          rows={4}
          hint={t("commentsHint")}
          error={error("comments")}
        />
        <fieldset className="flex flex-col gap-2">
          <legend className="text-label text-ink">{t("recommendation")}</legend>
          {RECOMMENDATIONS.map((value) => (
            <label
              key={value}
              className="flex cursor-pointer items-start gap-3 text-body text-ink"
            >
              <input
                type="radio"
                name="recommendation"
                value={value}
                checked={recommendation === value}
                onChange={() => setRecommendation(value)}
                className="mt-1 size-5 shrink-0 accent-primary"
              />
              <span className="flex flex-col">
                {t(`recommendations.${value}`)}
                <span className="text-meta text-ink-muted">
                  {t(`recommendationHints.${value}`)}
                </span>
              </span>
            </label>
          ))}
          {error("recommendation") ? (
            <p className="text-meta font-medium text-danger">
              {error("recommendation")}
            </p>
          ) : null}
        </fieldset>
        {recommendation === "extend" ? (
          <TextField
            label={t("extend_months")}
            name="extend_months"
            inputMode="numeric"
            hint={t("extend_monthsHint")}
            error={error("extend_months")}
            className="max-w-xs"
          />
        ) : null}
      </Card>
      <div className="flex flex-col items-start gap-3">
        <p className="text-meta text-ink-muted">{approvalNote}</p>
        <Button type="submit" variant="accent" loading={pending}>
          {t("submit")}
        </Button>
        <FormFeedback state={state} />
      </div>
    </form>
  );
}
