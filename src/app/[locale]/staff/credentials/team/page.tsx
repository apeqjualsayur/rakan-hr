import { getLocale, getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PersonAvatar } from "@/components/ui/PersonRow";
import { StatusChip } from "@/components/ui/StatusChip";
import { requireMember } from "@/lib/auth/member";
import { sortRows, summarise, typeName } from "@/lib/credentials/logic";
import { loadStatusRows } from "@/lib/credentials/server";
import type { CredentialStatusRow } from "@/lib/credentials/types";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata() {
  const t = await getTranslations("Credentials.tabs");
  return { title: t("team") };
}

// Managers see their team's credential status only (data-model.md §5): no files, no
// reference numbers, never restricted (health) records — the database filters them out.
export default async function TeamCredentialsPage() {
  const member = await requireMember(["manager"]);
  const t = await getTranslations("Credentials");
  const locale = await getLocale();
  const supabase = await createClient();
  const [rows, { data: people }] = await Promise.all([
    loadStatusRows(supabase),
    supabase.from("v_directory").select("id, full_name").order("full_name"),
  ]);
  const byPerson = new Map<string, CredentialStatusRow[]>();
  for (const row of rows) {
    if (row.employee_id === member.employeeId || row.requirement === null)
      continue;
    byPerson.set(row.employee_id, [
      ...(byPerson.get(row.employee_id) ?? []),
      row,
    ]);
  }
  const team = (people ?? []).filter((p) => byPerson.has(p.id as string));

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-display-sm text-ink">{t("tabs.team")}</h1>
      <p className="text-meta text-ink-muted">{t("team.intro")}</p>
      {team.length === 0 ? (
        <Card>
          <EmptyState message={t("team.none")} />
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {team.map((p) => {
            const personRows = sortRows(byPerson.get(p.id as string)!);
            const summary = summarise(personRows);
            return (
              <li key={p.id as string}>
                <Card className="flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <PersonAvatar
                      id={p.id as string}
                      name={p.full_name as string}
                    />
                    <div className="min-w-0">
                      <p className="text-h3 text-ink">
                        {p.full_name as string}
                      </p>
                      <p className="text-meta text-ink-muted">
                        {summary.mandatoryTotal
                          ? t("team.compliance", { pct: summary.percent })
                          : t("team.noRequirements")}
                      </p>
                    </div>
                  </div>
                  <ul className="flex flex-col divide-y divide-border">
                    {personRows.map((r) => (
                      <li
                        key={r.credential_type_id}
                        className="flex items-center justify-between gap-3 py-2"
                      >
                        <span className="text-body text-ink">
                          {r.requirement === "optional"
                            ? t("optional", { name: typeName(r, locale) })
                            : typeName(r, locale)}
                        </span>
                        <StatusChip
                          domain="credential"
                          status={r.display_status}
                          short
                        />
                      </li>
                    ))}
                  </ul>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
