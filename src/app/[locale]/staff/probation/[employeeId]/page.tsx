import { ChevronLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ProbationReviewForm } from "@/components/hiring/ProbationReviewForm";
import { ReviewSummary } from "@/components/hiring/ReviewSummary";
import { Card, CardHeader } from "@/components/ui/Card";
import { StatusChip } from "@/components/ui/StatusChip";
import { Link } from "@/i18n/navigation";
import { requireMember } from "@/lib/auth/member";
import { STAFF_ROLES } from "@/lib/auth/roles";
import { dateFromIso, formatDate } from "@/lib/format";
import { probationState } from "@/lib/hiring/logic";
import { REVIEW_COLUMNS, type ProbationReview } from "@/lib/hiring/types";
import { isUuid } from "@/lib/settings/form";
import { createClient } from "@/lib/supabase/server";
import { malaysiaToday } from "@/lib/format";

export async function generateMetadata() {
  const t = await getTranslations("Probation");
  return { title: t("title") };
}

// HIR-07 for managers: the probation review form for someone they manage (the reminder
// notifications link here). The Owner approves it on the employee record.
export default async function StaffProbationPage({
  params,
}: PageProps<"/[locale]/staff/probation/[employeeId]">) {
  await requireMember(STAFF_ROLES);
  const { employeeId } = await params;
  if (!isUuid(employeeId)) notFound();
  const t = await getTranslations("Probation");
  const locale = await getLocale();
  const supabase = await createClient();
  const [{ data: overview }, { data: reviews }] = await Promise.all([
    supabase
      .rpc("probation_overview", { p_employee_id: employeeId })
      .maybeSingle(),
    supabase
      .from("probation_reviews")
      .select(REVIEW_COLUMNS)
      .eq("employee_id", employeeId)
      .order("created_at", { ascending: false })
      .returns<ProbationReview[]>(),
  ]);
  const person = overview as {
    full_name: string;
    job_title: string | null;
    probation_end: string | null;
    confirmed_on: string | null;
  } | null;
  if (!person) notFound();
  const list = reviews ?? [];
  const { state, daysLeft } = probationState(
    person,
    list[0] ?? null,
    malaysiaToday(),
  );
  const date = (iso: string) => formatDate(dateFromIso(iso), locale, "full");

  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/staff"
        className="inline-flex min-h-11 w-fit items-center gap-1 text-label text-primary underline-offset-4 hover:underline"
      >
        <ChevronLeft aria-hidden size={20} strokeWidth={1.75} />
        {t("backHome")}
      </Link>
      <Card className="flex flex-col gap-2">
        <CardHeader
          title={person.full_name}
          action={<StatusChip domain="probation" status={state} />}
        />
        <p className="text-meta text-ink-muted">{person.job_title}</p>
        {person.probation_end && !person.confirmed_on ? (
          <p className="text-body text-ink">
            {daysLeft !== null && daysLeft < 0
              ? t("endedOn", { date: date(person.probation_end) })
              : t("endsOn", {
                  date: date(person.probation_end),
                  days: daysLeft ?? 0,
                })}
          </p>
        ) : null}
      </Card>
      {["on_probation", "due", "overdue"].includes(state) ? (
        <ProbationReviewForm
          employeeId={employeeId}
          employeeName={person.full_name}
          approvalNote={t("goesToOwner")}
        />
      ) : null}
      {list.map((review) => (
        <ReviewSummary key={review.id} review={review} reviewerName={null}>
          {review.status === "submitted" ? (
            <p className="text-meta text-ink-muted">{t("waitingForOwner")}</p>
          ) : null}
        </ReviewSummary>
      ))}
    </div>
  );
}
