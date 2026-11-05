import { getLocale, getTranslations } from "next-intl/server";
import { ReceiptsButton } from "@/components/claims/ClaimBits";
import { PendingClaims } from "@/components/claims/PendingClaims";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusChip } from "@/components/ui/StatusChip";
import { requireMember } from "@/lib/auth/member";
import { ADMIN_ROLES } from "@/lib/auth/roles";
import { CLAIM_COLUMNS, type Claim } from "@/lib/claims/types";
import { dateFromIso, formatDate, formatMoney } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata() {
  const t = await getTranslations("Claims");
  return { title: t("title") };
}

// CLM-01 for HR: claims waiting for a decision, and approved claims waiting for payroll
// (taxable and non-taxable totals, as they will appear as payroll inputs).
export default async function AdminClaimsPage() {
  const member = await requireMember(ADMIN_ROLES);
  const t = await getTranslations("Claims");
  const locale = await getLocale();
  const supabase = await createClient();
  const { data } = await supabase
    .from("claims")
    .select(
      `${CLAIM_COLUMNS}, employees (full_name), claim_types (name_en, name_ms, is_taxable), claim_receipts (id)`,
    )
    .eq("status", "approved")
    .is("payroll_run_id", null)
    .order("decided_at", { ascending: false })
    .limit(100);
  const approved = (data ?? []) as unknown as (Claim & {
    employees: { full_name: string } | null;
    claim_types: {
      name_en: string;
      name_ms: string;
      is_taxable: boolean;
    } | null;
    claim_receipts: { id: string }[];
  })[];
  const total = (taxable: boolean) =>
    approved
      .filter((c) => Boolean(c.claim_types?.is_taxable) === taxable)
      .reduce((s, c) => s + Number(c.amount), 0);

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-col gap-2">
        <CardHeader title={t("toApprove")} />
        <PendingClaims member={member} />
      </Card>
      <Card className="flex flex-col gap-3">
        <CardHeader title={t("forPayroll")} />
        {approved.length ? (
          <p className="text-meta text-ink-muted">
            {t("totals", {
              nonTaxable: formatMoney(total(false)),
              taxable: formatMoney(total(true)),
            })}
          </p>
        ) : null}
        {approved.length === 0 ? (
          <EmptyState message={t("noneForPayroll")} />
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {approved.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 py-3">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-body font-medium text-ink">
                    {c.employees?.full_name} ·{" "}
                    {locale === "ms"
                      ? c.claim_types?.name_ms
                      : c.claim_types?.name_en}{" "}
                    · {formatMoney(c.amount)}
                  </span>
                  <span className="text-meta text-ink-muted">
                    {formatDate(dateFromIso(c.expense_date), locale, "full")} ·{" "}
                    {c.description}
                    {c.claim_types?.is_taxable
                      ? ` · ${t("pending.taxable")}`
                      : ""}
                  </span>
                </span>
                {c.claim_receipts.length ? (
                  <ReceiptsButton claimId={c.id} />
                ) : null}
                <StatusChip domain="claim" status="approved" />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
