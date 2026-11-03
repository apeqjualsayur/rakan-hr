import { ChevronLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { SignedCopyButton } from "@/components/policies/SignedCopyButton";
import { Card, CardHeader } from "@/components/ui/Card";
import { StatusChip } from "@/components/ui/StatusChip";
import { Link } from "@/i18n/navigation";
import { requireMember } from "@/lib/auth/member";
import { can } from "@/lib/auth/roles";
import { formatDate, formatTime } from "@/lib/format";
import { audienceNames, loadAudienceContext } from "@/lib/policies/audience";
import { ackStatus, inLocale } from "@/lib/policies/logic";
import {
  POLICY_COLUMNS,
  type AckRow,
  type PolicyDocument,
} from "@/lib/policies/types";
import { isUuid } from "@/lib/settings/form";
import { createClient } from "@/lib/supabase/server";
import { NewVersion } from "./NewVersion";

export async function generateMetadata() {
  const t = await getTranslations("Policies");
  return { title: t("tracker") };
}

// POL-04 acknowledgement tracker for one version: who has and hasn't signed, with links to
// each signed copy; earlier versions; publish a new version (asks everyone again).
export default async function PolicyTrackerPage({
  params,
}: PageProps<"/[locale]/admin/compliance/policies/[policyId]">) {
  const member = await requireMember(["owner", "hr_admin", "auditor"]);
  const { policyId } = await params;
  if (!isUuid(policyId)) notFound();
  const t = await getTranslations("Policies");
  const locale = await getLocale();
  const supabase = await createClient();
  const { data: doc } = await supabase
    .from("policy_documents")
    .select(POLICY_COLUMNS)
    .eq("id", policyId)
    .maybeSingle<PolicyDocument>();
  if (!doc) notFound();
  const [{ data: ack }, { data: versions }, ctx] = await Promise.all([
    supabase.rpc("policy_ack_status", { p_policy_id: doc.id }),
    supabase
      .from("policy_documents")
      .select("id, version, published_at, superseded_at")
      .eq("code", doc.code)
      .order("version", { ascending: false }),
    loadAudienceContext(supabase),
  ]);
  const rows = (ack ?? []) as AckRow[];
  const signedCount = rows.filter((r) => r.signature_id).length;
  const when = (iso: string) =>
    `${formatDate(new Date(iso), locale, "full")}, ${formatTime(new Date(iso), locale)}`;

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/admin/compliance/policies"
        className="inline-flex min-h-11 w-fit items-center gap-1 text-label text-primary underline-offset-4 hover:underline"
      >
        <ChevronLeft aria-hidden size={20} strokeWidth={1.75} />
        {t("library")}
      </Link>

      <Card className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="text-h2 text-ink">
              {inLocale(doc, "title", locale)}
            </h2>
            <p className="text-meta text-ink-muted">
              {[
                t("versionMeta", {
                  version: doc.version,
                  date: formatDate(new Date(doc.published_at), locale, "full"),
                }),
                audienceNames(doc.audience, ctx) ?? t("audience.all"),
                doc.superseded_at ? t("supersededTag") : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <SignedCopyButton policyId={doc.id} label={t("original")} />
        </div>
        <p className="text-meta break-all text-ink-muted">
          {t("fingerprint", { sha: doc.document_sha256 })}
        </p>
      </Card>

      {doc.requires_signature ? (
        <Card className="flex flex-col gap-2">
          <CardHeader
            title={t("tracker")}
            action={
              <span className="text-body text-ink tabular-nums">
                {t("signedCount", { done: signedCount, total: rows.length })}
              </span>
            }
          />
          <p className="-mt-1 text-meta text-ink-muted">{t("trackerIntro")}</p>
          <ul className="divide-y divide-border">
            {rows.map((r) => (
              <li
                key={r.employee_id}
                className="flex flex-wrap items-center gap-3 py-3"
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-h3 text-ink">{r.full_name}</span>
                  <span className="text-meta text-ink-muted">
                    {[
                      r.employee_no,
                      r.signed_at
                        ? t("signedOn", { date: when(r.signed_at) })
                        : null,
                      r.has_account ? null : t("noAccount"),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                {r.signature_id ? (
                  <SignedCopyButton
                    signatureId={r.signature_id}
                    label={t("signedCopy")}
                    variant="ghost"
                  />
                ) : null}
                <StatusChip
                  domain="policy"
                  status={ackStatus(r.signed_at, doc.published_at)}
                />
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {(versions ?? []).length > 1 ? (
        <Card className="flex flex-col gap-2">
          <CardHeader title={t("versions")} as="h3" />
          <ul className="divide-y divide-border">
            {(versions ?? []).map((v) => (
              <li
                key={v.id as string}
                className="flex items-center justify-between gap-3 py-2.5"
              >
                <Link
                  href={`/admin/compliance/policies/${v.id}`}
                  aria-current={v.id === doc.id ? "page" : undefined}
                  className="text-body text-primary underline-offset-4 hover:underline aria-[current=page]:font-semibold aria-[current=page]:text-ink"
                >
                  {t("versionMeta", {
                    version: v.version as number,
                    date: formatDate(
                      new Date(v.published_at as string),
                      locale,
                      "full",
                    ),
                  })}
                </Link>
                {v.superseded_at ? (
                  <span className="text-meta text-ink-muted">
                    {t("supersededTag")}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {can(member.role, "editPeople") && !doc.superseded_at ? (
        <NewVersion
          tenantId={member.tenantId!}
          branches={ctx.branches}
          roles={ctx.roles}
          existing={{
            code: doc.code,
            title_en: doc.title_en,
            title_ms: doc.title_ms,
            audience: doc.audience,
            requires_signature: doc.requires_signature,
          }}
        />
      ) : null}
    </div>
  );
}
