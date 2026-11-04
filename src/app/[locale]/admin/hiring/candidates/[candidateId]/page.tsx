import { CheckCircle2, ChevronLeft, Circle } from "lucide-react";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/Card";
import { StatusChip } from "@/components/ui/StatusChip";
import { Link } from "@/i18n/navigation";
import { requireMember } from "@/lib/auth/member";
import { ADMIN_ROLES, can } from "@/lib/auth/roles";
import { typeName } from "@/lib/credentials/logic";
import { formatDate } from "@/lib/format";
import {
  offerDefaults,
  PREBOARDING_STEPS,
  preboardingProgress,
  stageMoves,
} from "@/lib/hiring/logic";
import {
  CANDIDATE_COLUMNS,
  OFFER_COLUMNS,
  OPENING_COLUMNS,
  type Candidate,
  type JobOpening,
  type Offer,
  type PreboardingContext,
} from "@/lib/hiring/types";
import { isUuid } from "@/lib/settings/form";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { CandidateForm } from "../CandidateForm";
import { ConvertButton, StageActions } from "./CandidateActions";
import { OfferPanel } from "./OfferPanel";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/admin/hiring/candidates/[candidateId]">) {
  const { candidateId } = await params;
  const t = await getTranslations("Hiring");
  if (!isUuid(candidateId)) return { title: t("title") };
  const supabase = await createClient();
  const { data } = await supabase
    .from("candidates")
    .select("full_name")
    .eq("id", candidateId)
    .maybeSingle();
  return { title: (data?.full_name as string | undefined) ?? t("title") };
}

// One candidate (HIR-02 → HIR-05): stage, details and CV, the offer, pre-boarding progress
// and Convert to employee.
export default async function CandidatePage({
  params,
}: PageProps<"/[locale]/admin/hiring/candidates/[candidateId]">) {
  const member = await requireMember(ADMIN_ROLES);
  const { candidateId } = await params;
  if (!isUuid(candidateId)) notFound();
  const t = await getTranslations("Hiring");
  const locale = await getLocale();
  const supabase = await createClient();
  const canEdit = can(member.role, "manageHiring");

  const { data: candidate } = await supabase
    .from("candidates")
    .select(CANDIDATE_COLUMNS)
    .eq("id", candidateId)
    .maybeSingle<Candidate>();
  if (!candidate) notFound();

  const [
    { data: opening },
    { data: offers },
    { data: openings },
    { data: roles },
    { data: branches },
    { data: managers },
  ] = await Promise.all([
    supabase
      .from("job_openings")
      .select(OPENING_COLUMNS)
      .eq("id", candidate.job_opening_id)
      .maybeSingle<JobOpening>(),
    supabase
      .from("offers")
      .select(OFFER_COLUMNS)
      .eq("candidate_id", candidate.id)
      .order("created_at", { ascending: false })
      .returns<Offer[]>(),
    supabase
      .from("job_openings")
      .select("id, title")
      .order("created_at", { ascending: false }),
    supabase.from("job_roles").select("id, name").order("sort_order"),
    supabase.from("branches").select("id, name").order("created_at"),
    supabase
      .from("employees")
      .select("id, full_name")
      .in("status", ["active", "on_notice"])
      .is("deleted_at", null)
      .order("full_name"),
  ]);
  const open = (offers ?? []).find((o) =>
    ["draft", "sent", "accepted"].includes(o.status),
  );
  const previous = (offers ?? [])[0];
  const defaults: Partial<Offer> = previous
    ? { ...previous, id: undefined, status: "draft" }
    : {
        ...(opening ? offerDefaults(opening) : {}),
        // company-config.yaml work_pattern: 8 hours a day, 5.5 days a week.
        normal_hours_per_day: "8",
        work_days_per_week: "5.5",
      };
  const accepted = Boolean(candidate.offer_accepted_at);
  const progress = accepted
    ? await loadProgress(supabase, candidate, open ?? null)
    : null;

  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/admin/hiring"
        className="inline-flex min-h-11 w-fit items-center gap-1 text-label text-primary underline-offset-4 hover:underline"
      >
        <ChevronLeft aria-hidden size={20} strokeWidth={1.75} />
        {t("candidate.back")}
      </Link>

      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <h2 className="text-h2 text-ink">{candidate.full_name}</h2>
            <p className="text-meta text-ink-muted">
              {[opening?.title, candidate.email, candidate.phone]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <StatusChip domain="candidate" status={candidate.stage} />
        </div>
        {candidate.stage === "rejected" ? (
          <p className="text-meta text-ink-muted">
            {candidate.rejected_reason
              ? t("candidate.rejectedBecause", {
                  reason: candidate.rejected_reason,
                })
              : t("candidate.rejectedNoReason")}
          </p>
        ) : null}
        {canEdit ? (
          <StageActions
            candidateId={candidate.id}
            moves={stageMoves(candidate.stage, accepted)}
            accepted={accepted}
          />
        ) : null}
      </Card>

      <div className="grid items-start gap-4 lg:grid-cols-[3fr_2fr]">
        <div className="flex flex-col gap-4">
          {candidate.converted_at && candidate.employee_id ? (
            <Card className="flex flex-col gap-3">
              <CardHeader title={t("convert.doneTitle")} />
              <p className="text-body text-ink-muted">
                {t("convert.doneBody", {
                  date: formatDate(
                    new Date(candidate.converted_at),
                    locale,
                    "full",
                  ),
                })}
              </p>
              <Link
                href={`/admin/people/${candidate.employee_id}`}
                className={cn(
                  buttonVariants({ variant: "outline", size: "row" }),
                  "self-start",
                )}
              >
                {t("convert.openRecord")}
              </Link>
            </Card>
          ) : null}

          {candidate.stage !== "rejected" || open ? (
            <OfferPanel
              candidateId={candidate.id}
              candidateEmail={candidate.email}
              offer={open ?? null}
              defaults={defaults}
              canEdit={
                canEdit &&
                !candidate.converted_at &&
                candidate.stage !== "rejected"
              }
              options={{
                roles: (roles ?? []) as { id: string; name: string }[],
                branches: (branches ?? []) as {
                  id: string;
                  name: string | null;
                }[],
                managers: (managers ?? []) as {
                  id: string;
                  full_name: string;
                }[],
              }}
              now={new Date().toISOString()}
            />
          ) : null}

          {progress && !candidate.converted_at ? (
            <Card className="flex flex-col gap-4">
              <CardHeader
                title={t("preboarding.title")}
                action={
                  candidate.preboarding_submitted_at ? (
                    <span className="text-meta font-medium text-primary">
                      {t("preboarding.submitted", {
                        date: formatDate(
                          new Date(candidate.preboarding_submitted_at),
                          locale,
                          "full",
                        ),
                      })}
                    </span>
                  ) : null
                }
              />
              <ul className="flex flex-col gap-2">
                {PREBOARDING_STEPS.filter((s) => s !== "offer").map((step) => (
                  <li
                    key={step}
                    className="flex items-center gap-3 text-body text-ink"
                  >
                    {progress.done[step] ? (
                      <CheckCircle2
                        aria-hidden
                        size={20}
                        strokeWidth={1.75}
                        className="text-primary"
                      />
                    ) : (
                      <Circle
                        aria-hidden
                        size={20}
                        strokeWidth={1.75}
                        className="text-ink-muted"
                      />
                    )}
                    <span>{t(`preboarding.steps.${step}`)}</span>
                    <span className="sr-only">
                      {progress.done[step]
                        ? t("preboarding.done")
                        : t("preboarding.notYet")}
                    </span>
                  </li>
                ))}
              </ul>
              {progress.credentials.length ? (
                <div className="flex flex-col gap-1">
                  <p className="text-label text-ink">
                    {t("preboarding.credentials")}
                  </p>
                  <ul className="flex flex-col gap-1">
                    {progress.credentials.map((c) => (
                      <li
                        key={c.name}
                        className="flex items-center justify-between gap-3 text-meta"
                      >
                        <span className="text-ink">
                          {c.name}
                          {c.mandatory ? "" : ` · ${t("preboarding.optional")}`}
                        </span>
                        {c.status ? (
                          <StatusChip
                            domain="credentialRecord"
                            status={c.status}
                          />
                        ) : (
                          <StatusChip domain="credential" status="missing" />
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <p className="text-meta text-ink-muted">
                {candidate.preboarding_token_used_at
                  ? t("preboarding.linkUsed", {
                      date: formatDate(
                        new Date(candidate.preboarding_token_used_at),
                        locale,
                        "full",
                      ),
                    })
                  : candidate.preboarding_token_expires_at
                    ? t("preboarding.linkUnused", {
                        date: formatDate(
                          new Date(candidate.preboarding_token_expires_at),
                          locale,
                          "full",
                        ),
                      })
                    : null}
              </p>
            </Card>
          ) : null}

          {accepted &&
          !candidate.converted_at &&
          candidate.stage === "offer" &&
          canEdit ? (
            <Card className="flex flex-col gap-3">
              <CardHeader title={t("convert.title")} />
              <p className="text-body text-ink-muted">{t("convert.body")}</p>
              {progress && !Object.values(progress.done).every(Boolean) ? (
                <p className="rounded-tile bg-warning-tint px-4 py-3 text-meta text-warning">
                  {t("convert.incomplete")}
                </p>
              ) : null}
              <ConvertButton candidateId={candidate.id} />
            </Card>
          ) : null}
        </div>

        <div className="flex flex-col gap-4">
          <h3 className="text-h3 text-ink">{t("candidate.details")}</h3>
          <CandidateForm
            tenantId={member.tenantId!}
            openings={(openings ?? []) as { id: string; title: string }[]}
            candidate={candidate}
            canEdit={canEdit && !candidate.converted_at}
          />
        </div>
      </div>
    </div>
  );
}

/** What HR sees of the candidate's pre-boarding (read with HR's own access). */
async function loadProgress(
  supabase: Awaited<ReturnType<typeof createClient>>,
  candidate: Candidate,
  offer: Offer | null,
) {
  const locale = await getLocale();
  if (!candidate.employee_id) return null;
  const [
    { data: employee },
    { data: bank },
    { data: credentials },
    { data: required },
  ] = await Promise.all([
    supabase
      .from("employees")
      .select(
        "id, id_no_last4, date_of_birth, phone, address, emergency_contact, pcb_category, job_role_id",
      )
      .eq("id", candidate.employee_id)
      .maybeSingle(),
    supabase
      .from("bank_accounts")
      .select("bank_code")
      .eq("employee_id", candidate.employee_id)
      .eq("is_primary", true)
      .maybeSingle(),
    supabase
      .from("staff_credentials")
      .select("credential_type_id, status, credential_types (name_en, name_ms)")
      .eq("employee_id", candidate.employee_id)
      .neq("status", "withdrawn")
      .order("created_at", { ascending: false }),
    offer?.job_role_id
      ? supabase
          .from("role_credential_requirements")
          .select(
            "credential_type_id, requirement, credential_types (name_en, name_ms, sort_order)",
          )
          .eq("job_role_id", offer.job_role_id)
      : Promise.resolve({ data: [] }),
  ]);
  type Named = { name_en: string; name_ms: string };
  const creds = (credentials ?? []) as unknown as {
    credential_type_id: string;
    status:
      | "draft"
      | "pending"
      | "verified"
      | "rejected"
      | "superseded"
      | "withdrawn";
    credential_types: Named | null;
  }[];
  const reqs = (required ?? []) as unknown as {
    credential_type_id: string;
    requirement: "mandatory" | "optional";
    credential_types: (Named & { sort_order: number }) | null;
  }[];
  const done = preboardingProgress({
    offer: offer
      ? ({ status: offer.status } as PreboardingContext["offer"])
      : null,
    employee: employee as unknown as PreboardingContext["employee"],
    bank: bank as PreboardingContext["bank"],
    required: reqs,
    credentials: creds as unknown as PreboardingContext["credentials"],
  });
  const rows = [
    ...reqs
      .sort(
        (a, b) =>
          (a.credential_types?.sort_order ?? 0) -
          (b.credential_types?.sort_order ?? 0),
      )
      .map((r) => ({
        name: r.credential_types ? typeName(r.credential_types, locale) : "",
        mandatory: r.requirement === "mandatory",
        status:
          creds.find((c) => c.credential_type_id === r.credential_type_id)
            ?.status ?? null,
      })),
    ...creds
      .filter(
        (c) => !reqs.some((r) => r.credential_type_id === c.credential_type_id),
      )
      .map((c) => ({
        name: c.credential_types ? typeName(c.credential_types, locale) : "",
        mandatory: false,
        status: c.status,
      })),
  ];
  return { done, credentials: rows };
}
