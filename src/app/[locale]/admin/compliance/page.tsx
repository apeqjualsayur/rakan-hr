import { Download } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusChip } from "@/components/ui/StatusChip";
import { Link } from "@/i18n/navigation";
import { requireMember } from "@/lib/auth/member";
import { buildMatrix, summarise, typeName } from "@/lib/credentials/logic";
import { loadStatusRows } from "@/lib/credentials/server";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export async function generateMetadata() {
  const t = await getTranslations("Compliance");
  return { title: t("title") };
}

// CRD-15 compliance matrix: staff × required credentials, colour-coded by status (text +
// colour, never colour alone), with each person's mandatory compliance % (CRD-13).
export default async function ComplianceMatrixPage() {
  const member = await requireMember(["owner", "hr_admin", "auditor"]);
  const t = await getTranslations("Compliance.matrix");
  const locale = await getLocale();
  const supabase = await createClient();
  const [rows, { data: people }] = await Promise.all([
    loadStatusRows(supabase),
    supabase
      .from("employees")
      .select("id, full_name, employee_no")
      .is("deleted_at", null)
      .neq("status", "left")
      .order("full_name"),
  ]);
  const matrix = buildMatrix(rows);
  const listed = (people ?? []).filter((p) =>
    rows.some((r) => r.employee_id === p.id && r.requirement !== null),
  );
  const canOpen = member.role === "owner" || member.role === "hr_admin";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <p className="max-w-3xl text-meta text-ink-muted">{t("intro")}</p>
        {listed.length ? (
          <a
            href={`/${locale}/admin/compliance/pdf`}
            className={cn(buttonVariants({ variant: "outline" }), "w-fit")}
          >
            <Download aria-hidden />
            {t("exportPdf")}
          </a>
        ) : null}
      </div>
      {listed.length === 0 ? (
        <Card>
          <EmptyState message={t("empty")} />
        </Card>
      ) : (
        <Card className="overflow-x-auto p-0 md:p-0">
          <table className="w-full min-w-max border-collapse text-left">
            <thead>
              <tr className="border-b border-border">
                <th
                  scope="col"
                  className="sticky left-0 z-10 bg-surface px-4 py-3 text-label text-ink"
                >
                  {t("person")}
                </th>
                <th scope="col" className="px-3 py-3 text-label text-ink">
                  {t("compliance")}
                </th>
                {matrix.columns.map((c) => (
                  <th
                    key={c.id}
                    scope="col"
                    className="max-w-36 px-3 py-3 text-label text-ink"
                  >
                    {typeName(c, locale)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {listed.map((p) => {
                const personRows = rows.filter((r) => r.employee_id === p.id);
                const summary = summarise(personRows);
                return (
                  <tr
                    key={p.id as string}
                    className="border-b border-border last:border-b-0"
                  >
                    <th
                      scope="row"
                      className="sticky left-0 z-10 bg-surface px-4 py-3 text-left"
                    >
                      {canOpen ? (
                        <Link
                          href={`/admin/people/${p.id}?tab=credentials`}
                          className="text-body font-semibold text-ink underline-offset-4 hover:underline"
                        >
                          {p.full_name as string}
                        </Link>
                      ) : (
                        <span className="text-body font-semibold text-ink">
                          {p.full_name as string}
                        </span>
                      )}
                    </th>
                    <td className="px-3 py-3 text-body text-ink tabular-nums">
                      {summary.mandatoryTotal ? `${summary.percent}%` : "—"}
                    </td>
                    {matrix.columns.map((c) => {
                      const cell = matrix.cell(p.id as string, c.id);
                      return (
                        <td key={c.id} className="px-3 py-3">
                          {cell ? (
                            <span className="flex flex-col items-start gap-0.5">
                              <StatusChip
                                domain="credential"
                                status={cell.display_status}
                                short
                              />
                              {cell.requirement === "optional" ? (
                                <span className="text-xs text-ink-muted">
                                  {t("optional")}
                                </span>
                              ) : null}
                            </span>
                          ) : (
                            <span
                              className="text-meta text-ink-muted"
                              title={t("notRequired")}
                            >
                              —
                              <span className="sr-only">
                                {t("notRequired")}
                              </span>
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
