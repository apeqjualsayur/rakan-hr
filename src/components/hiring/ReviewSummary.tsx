import { useLocale, useTranslations } from "next-intl";
import { Card } from "@/components/ui/Card";
import { StatusChip } from "@/components/ui/StatusChip";
import { dateFromIso, formatDate } from "@/lib/format";
import { averageRating } from "@/lib/hiring/logic";
import { PROBATION_CRITERIA, type ProbationReview } from "@/lib/hiring/types";
import type { ReactNode } from "react";

// One probation review (HIR-07): ratings, comments, recommendation and outcome.
export function ReviewSummary({
  review,
  reviewerName,
  children,
}: {
  review: ProbationReview;
  reviewerName: string | null;
  /** Approve / reject, letter links. */
  children?: ReactNode;
}) {
  const t = useTranslations("Probation");
  const locale = useLocale();
  const date = (iso: string) => formatDate(dateFromIso(iso), locale, "full");
  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <p className="text-h3 text-ink">
            {t(`form.recommendations.${review.recommendation}`)}
            {review.recommendation === "extend" && review.extend_months
              ? ` · ${t("months", { count: review.extend_months })}`
              : ""}
          </p>
          <p className="text-meta text-ink-muted">
            {t("reviewMeta", {
              date: formatDate(new Date(review.created_at), locale, "full"),
              name: reviewerName ?? t("someone"),
              average: averageRating(review.ratings) ?? "–",
            })}
          </p>
        </div>
        <StatusChip domain="probationReview" status={review.status} />
      </div>
      <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
        {PROBATION_CRITERIA.map((c) => (
          <div key={c} className="flex items-center justify-between gap-3">
            <dt className="text-meta text-ink-muted">
              {t(`form.criteria.${c}.label`)}
            </dt>
            <dd className="text-body font-medium text-ink tabular-nums">
              {review.ratings[c]} / 5
            </dd>
          </div>
        ))}
      </dl>
      <p className="text-body whitespace-pre-line text-ink">
        {review.comments}
      </p>
      {review.status === "approved" ? (
        <p className="text-meta font-medium text-primary">
          {review.confirmed_on
            ? t("outcomeConfirmed", { date: date(review.confirmed_on) })
            : review.new_probation_end
              ? t("outcomeExtended", { date: date(review.new_probation_end) })
              : t("outcomeEnd")}
        </p>
      ) : null}
      {children}
    </Card>
  );
}
