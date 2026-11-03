import { ChevronRight } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusChip } from "@/components/ui/StatusChip";
import { Link } from "@/i18n/navigation";
import { requireMember } from "@/lib/auth/member";
import { STAFF_ROLES } from "@/lib/auth/roles";
import { formatDate } from "@/lib/format";
import { ackStatus, inLocale } from "@/lib/policies/logic";
import { pendingPolicies } from "@/lib/policies/server";
import { POLICY_COLUMNS, type PolicyDocument } from "@/lib/policies/types";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata() {
  const t = await getTranslations("Policies");
  return { title: t("title") };
}

// POL-02 for staff: policies waiting for my signature, then the current ones I can read.
export default async function StaffPoliciesPage() {
  const member = await requireMember(STAFF_ROLES);
  const t = await getTranslations("Policies");
  const locale = await getLocale();
  const supabase = await createClient();
  const [pending, { data: current }, { data: signatures }] = await Promise.all([
    pendingPolicies(supabase),
    supabase
      .from("policy_documents")
      .select(POLICY_COLUMNS)
      .is("superseded_at", null)
      .order("title_en")
      .returns<PolicyDocument[]>(),
    supabase
      .from("signatures")
      .select("entity_id, signed_at")
      .eq("entity_type", "policy_document")
      .eq("signer_user_id", member.userId!),
  ]);
  const signedAt = new Map(
    (signatures ?? []).map((s) => [
      s.entity_id as string,
      s.signed_at as string,
    ]),
  );
  const pendingIds = new Set(pending.map((p) => p.id));
  const others = (current ?? []).filter((d) => !pendingIds.has(d.id));
  const day = (iso: string) => formatDate(new Date(iso), locale, "full");

  const row = (
    d: PolicyDocument,
    status: "signed" | "awaiting_signature" | "overdue" | null,
  ) => (
    <li key={d.id}>
      <Link
        href={`/staff/policies/${d.id}`}
        className="-mx-2 flex items-center gap-3 rounded-tile px-2 py-3 transition-colors hover:bg-canvas"
      >
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-h3 text-ink">
            {inLocale(d, "title", locale)}
          </span>
          <span className="text-meta text-ink-muted">
            {t("versionMeta", {
              version: d.version,
              date: day(d.published_at),
            })}
          </span>
        </span>
        {status ? <StatusChip domain="policy" status={status} /> : null}
        <ChevronRight
          aria-hidden
          size={20}
          strokeWidth={1.75}
          className="shrink-0 text-ink-muted"
        />
      </Link>
    </li>
  );

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-display-sm text-ink">{t("title")}</h1>
      <Card className="flex flex-col gap-2">
        <CardHeader title={t("toSign")} />
        {pending.length ? (
          <ul className="divide-y divide-border">
            {pending.map((d) => row(d, ackStatus(null, d.published_at)))}
          </ul>
        ) : (
          <EmptyState message={t("nothingToSign")} className="py-2" />
        )}
      </Card>
      {others.length ? (
        <Card className="flex flex-col gap-2">
          <CardHeader title={t("library")} as="h3" />
          <ul className="divide-y divide-border">
            {others.map((d) => row(d, signedAt.has(d.id) ? "signed" : null))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
