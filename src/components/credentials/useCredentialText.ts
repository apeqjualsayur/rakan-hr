"use client";

import { useLocale, useTranslations } from "next-intl";
import { dateFromIso, formatDate } from "@/lib/format";
import { rowAction, typeName, type RowAction } from "@/lib/credentials/logic";
import type { CredentialStatusRow } from "@/lib/credentials/types";

/** Title, meta line and action label for a credential row (ui-system.md §4, §5). */
export function useCredentialText() {
  const t = useTranslations("Credentials");
  const locale = useLocale();
  const day = (iso: string | null) =>
    iso ? formatDate(dateFromIso(iso), locale, "full") : "";
  const short = (iso: string | null) =>
    iso ? formatDate(dateFromIso(iso), locale, "short") : "";
  const stamp = (iso: string | null) =>
    iso ? formatDate(new Date(iso), locale, "short") : "";

  return (
    row: CredentialStatusRow,
  ): { title: string; meta: string; action: RowAction; target: string } => {
    const name = typeName(row, locale);
    const title =
      row.requirement === "optional" ? t("optional", { name }) : name;
    const requirement =
      row.requirement === "mandatory" ? t("requirement.mandatory") : null;
    let meta: string;
    switch (row.display_status) {
      case "expired":
        meta = [t("meta.expired", { date: day(row.expiry_date) }), requirement]
          .filter(Boolean)
          .join(" · ");
        break;
      case "expiring_soon":
        meta = t("meta.expiring", {
          days: row.days_left ?? 0,
          date: short(row.expiry_date),
        });
        break;
      case "pending":
        meta = t("meta.pending", { date: stamp(row.submitted_at) });
        break;
      case "upcoming":
        meta = t("meta.upcoming", { date: day(row.effective_date) });
        break;
      case "rejected":
        meta = t("meta.rejected", { reason: row.reject_reason ?? "" });
        break;
      case "missing":
        meta = t("meta.missing");
        break;
      default:
        meta = row.expiry_date
          ? t("meta.valid", {
              verified: stamp(row.verified_at),
              expiry: day(row.expiry_date),
            })
          : t("meta.validNoExpiry", { verified: stamp(row.verified_at) });
    }
    return { title, meta, ...rowAction(row) };
  };
}
