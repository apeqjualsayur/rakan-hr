import { getLocale, getTranslations } from "next-intl/server";
import {
  ProbationDecision,
  RetryLetterButton,
} from "@/components/hiring/ProbationActions";
import { ProbationReviewForm } from "@/components/hiring/ProbationReviewForm";
import { ReviewSummary } from "@/components/hiring/ReviewSummary";
import { Card, CardHeader } from "@/components/ui/Card";
import { StatusChip } from "@/components/ui/StatusChip";
import type { CurrentMember } from "@/lib/auth/member";
import { can } from "@/lib/auth/roles";
import { dateFromIso, formatDate } from "@/lib/format";
import { loadProbation } from "@/lib/hiring/probation";
import type { Employee } from "@/lib/people/employee";
import { createClient } from "@/lib/supabase/server";
import { OpenFileButton } from "../../hiring/candidates/OpenFileButton";

// HIR-07 on the employee record: where probation stands, the review form (HR / owner),
// submitted reviews with the Owner's approval, and the confirmation / extension letter.
export async function ProbationTab({
  employee,
  member,
}: {
  employee: Pick<Employee, "id" | "full_name">;
  member: CurrentMember;
}) {
  const t = await getTranslations("Probation");
  const locale = await getLocale();
  const p = await loadProbation(await createClient(), employee.id);
  const canReview = can(member.role, "manageHiring");
  const isOwner = can(member.role, "approveProbation");
  const date = (iso: string) => formatDate(dateFromIso(iso), locale, "full");

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-3">
        <CardHeader
          title={t("title")}
          action={<StatusChip domain="probation" status={p.state} />}
        />
        <p className="text-body text-ink-muted">
          {p.state === "none"
            ? t("none")
            : p.state === "confirmed"
              ? t("confirmedOn", { date: date(p.record!.confirmed_on!) })
              : p.daysLeft !== null && p.daysLeft < 0
                ? t("endedOn", { date: date(p.record!.probation_end!) })
                : t("endsOn", {
                    date: date(p.record!.probation_end!),
                    days: p.daysLeft ?? 0,
                  })}
        </p>
      </Card>

      {canReview && ["on_probation", "due", "overdue"].includes(p.state) ? (
        <ProbationReviewForm
          employeeId={employee.id}
          employeeName={employee.full_name}
          approvalNote={isOwner ? t("ownerFinal") : t("goesToOwner")}
        />
      ) : null}

      {p.reviews.length ? (
        <h3 className="text-h3 text-ink">{t("history")}</h3>
      ) : null}
      {p.reviews.map((review) => (
        <ReviewSummary
          key={review.id}
          review={review}
          reviewerName={p.reviewerName(review.reviewer_id)}
        >
          {review.status === "submitted" &&
          isOwner &&
          review.approval_id &&
          review.reviewer_id !== member.userId ? (
            <ProbationDecision approvalId={review.approval_id} />
          ) : review.status === "submitted" ? (
            <p className="text-meta text-ink-muted">{t("waitingForOwner")}</p>
          ) : null}
          {review.letter_path ? (
            <OpenFileButton
              kind="probationLetter"
              id={review.id}
              label={
                review.confirmed_on
                  ? t("confirmationLetter")
                  : t("extensionLetter")
              }
            />
          ) : review.status === "approved" &&
            review.recommendation !== "end" ? (
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-meta text-ink-muted">
                {review.letter_error ? t("letterFailed") : t("letterComing")}
              </p>
              {review.letter_error && canReview ? (
                <RetryLetterButton reviewId={review.id} />
              ) : null}
            </div>
          ) : null}
        </ReviewSummary>
      ))}
    </div>
  );
}
