import { getLocale, getTranslations } from "next-intl/server";
import { LeaveDecision } from "@/components/leave/LeaveBits";
import { CategoryTag } from "@/components/ui/CategoryTag";
import { EmptyState } from "@/components/ui/EmptyState";
import type { CurrentMember } from "@/lib/auth/member";
import { leftThisMonth } from "@/lib/claims/logic";
import { CLAIM_COLUMNS, type Claim } from "@/lib/claims/types";
import { dateFromIso, formatDate, formatMoney } from "@/lib/format";
import { decidableApprovals } from "@/lib/leave/server";
import { createClient } from "@/lib/supabase/server";
import { ReceiptsButton } from "./ClaimBits";

type Row = Claim & {
  claim_types: {
    name_en: string;
    name_ms: string;
    monthly_limit: string | null;
    is_taxable: boolean;
  } | null;
  claim_receipts: { id: string }[];
};

// CLM-01 approvals: pending claims with the receipt, the month's use of the limit after
// this claim, and Approve / Reject where the reader is the approver.
export async function PendingClaims({ member }: { member: CurrentMember }) {
  const t = await getTranslations("Claims.pending");
  const locale = await getLocale();
  const supabase = await createClient();
  const { data } = await supabase
    .from("claims")
    .select(
      `${CLAIM_COLUMNS}, claim_types (name_en, name_ms, monthly_limit, is_taxable), claim_receipts (id)`,
    )
    .eq("status", "pending")
    .order("created_at");
  const rows = ((data ?? []) as unknown as Row[]).filter(
    (r) => r.employee_id !== member.employeeId,
  );
  if (rows.length === 0) return <EmptyState message={t("none")} />;
  const ids = [...new Set(rows.map((r) => r.employee_id))];
  const [decidable, { data: directory }, { data: month }] = await Promise.all([
    decidableApprovals(
      supabase,
      member.userId!,
      member.role!,
      rows.map((r) => r.approval_id).filter(Boolean) as string[],
    ),
    // Managers cannot read colleagues' employee rows; the directory has their names.
    supabase.from("v_directory").select("id, full_name").in("id", ids),
    supabase
      .from("claims")
      .select("employee_id, claim_type_id, expense_date, amount")
      .in("employee_id", ids)
      .eq("status", "approved"),
  ]);
  const name = (id: string) =>
    (directory ?? []).find((d) => d.id === id)?.full_name ?? t("someone");
  const approvedInMonth = (r: Row) =>
    (month ?? [])
      .filter(
        (m) =>
          m.employee_id === r.employee_id &&
          m.claim_type_id === r.claim_type_id &&
          String(m.expense_date).slice(0, 7) === r.expense_date.slice(0, 7),
      )
      .reduce((s, m) => s + Number(m.amount), 0);

  return (
    <ul className="flex flex-col divide-y divide-border">
      {rows.map((r) => {
        const used = approvedInMonth(r) + Number(r.amount);
        const left = r.claim_types?.monthly_limit
          ? leftThisMonth(r.claim_types.monthly_limit, used.toFixed(2))
          : null;
        return (
          <li
            key={r.id}
            className="flex flex-col gap-3 py-4 md:flex-row md:items-center"
          >
            <CategoryTag
              category="claim"
              className="hidden self-start md:inline-flex md:self-center"
            />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <p className="text-h3 text-ink">
                {name(r.employee_id)} · {r.description}, {formatMoney(r.amount)}
              </p>
              <p className="text-meta text-ink-muted">
                {[
                  locale === "ms"
                    ? r.claim_types?.name_ms
                    : r.claim_types?.name_en,
                  formatDate(dateFromIso(r.expense_date), locale, "full"),
                  r.distance_km
                    ? t("mileage", {
                        km: Number(r.distance_km),
                        rate: formatMoney(r.rate_per_km ?? 0),
                      })
                    : null,
                  r.claim_receipts.length
                    ? t("receiptAttached", { count: r.claim_receipts.length })
                    : t("noReceipt"),
                  left !== null
                    ? t("leftAfter", { amount: formatMoney(left) })
                    : t("withinLimit"),
                  r.claim_types?.is_taxable ? t("taxable") : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {r.claim_receipts.length ? (
                <ReceiptsButton claimId={r.id} />
              ) : null}
              {r.approval_id && decidable.has(r.approval_id) ? (
                <LeaveDecision approvalId={r.approval_id} />
              ) : (
                <span className="text-meta text-ink-muted">{t("waiting")}</span>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
