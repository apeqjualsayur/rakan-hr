import { ChevronRight } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Link } from "@/i18n/navigation";
import { requireMember } from "@/lib/auth/member";
import { can } from "@/lib/auth/roles";
import { formatDate } from "@/lib/format";
import {
  audienceMembers,
  audienceNames,
  loadAudienceContext,
} from "@/lib/policies/audience";
import { inLocale } from "@/lib/policies/logic";
import { POLICY_COLUMNS, type PolicyDocument } from "@/lib/policies/types";
import { createClient } from "@/lib/supabase/server";
import { PublishPolicyForm } from "./PublishPolicyForm";

export async function generateMetadata() {
  const t = await getTranslations("Policies");
  return { title: t("library") };
}

// POL-02 / POL-04: the policy library (current version of each) with how many have signed.
export default async function PolicyLibraryPage() {
  const member = await requireMember(["owner", "hr_admin", "auditor"]);
  const t = await getTranslations("Policies");
  const locale = await getLocale();
  const supabase = await createClient();
  const [{ data: current }, ctx, { data: signatures }] = await Promise.all([
    supabase
      .from("policy_documents")
      .select(POLICY_COLUMNS)
      .is("superseded_at", null)
      .order("code")
      .returns<PolicyDocument[]>(),
    loadAudienceContext(supabase),
    supabase
      .from("signatures")
      .select("entity_id, signer_user_id")
      .eq("entity_type", "policy_document"),
  ]);
  const docs = current ?? [];
  const hasPdpa = docs.some((d) => d.code === "PDPA_NOTICE");

  return (
    <div className="flex flex-col gap-6">
      {!hasPdpa ? (
        <p className="rounded-tile bg-warning-tint px-4 py-3 text-body text-warning">
          {t("noPdpa")}
        </p>
      ) : null}
      <Card className="flex flex-col gap-2">
        <CardHeader title={t("library")} />
        {docs.length === 0 ? (
          <EmptyState message={t("none")} />
        ) : (
          <ul className="divide-y divide-border">
            {docs.map((d) => {
              const reach = audienceMembers(d.audience, ctx);
              const signed = new Set(
                (signatures ?? [])
                  .filter((s) => s.entity_id === d.id)
                  .map((s) => s.signer_user_id as string),
              );
              const done = reach.filter((m) => signed.has(m.user_id)).length;
              return (
                <li key={d.id}>
                  <Link
                    href={`/admin/compliance/policies/${d.id}`}
                    className="-mx-2 flex items-center gap-4 rounded-tile px-2 py-3 transition-colors hover:bg-canvas"
                  >
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-h3 text-ink">
                        {inLocale(d, "title", locale)}
                      </span>
                      <span className="text-meta text-ink-muted">
                        {[
                          t("versionMeta", {
                            version: d.version,
                            date: formatDate(
                              new Date(d.published_at),
                              locale,
                              "full",
                            ),
                          }),
                          audienceNames(d.audience, ctx) ?? t("audience.all"),
                        ].join(" · ")}
                      </span>
                    </span>
                    <span className="text-body text-ink tabular-nums">
                      {d.requires_signature
                        ? t("signedCount", { done, total: reach.length })
                        : t("noSignature")}
                    </span>
                    <ChevronRight
                      aria-hidden
                      size={20}
                      strokeWidth={1.75}
                      className="text-ink-muted"
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      {can(member.role, "editPeople") ? (
        <PublishPolicyForm
          tenantId={member.tenantId!}
          branches={ctx.branches}
          roles={ctx.roles}
        />
      ) : null}
    </div>
  );
}
