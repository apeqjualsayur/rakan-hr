import { getLocale, getTranslations } from "next-intl/server";
import { CredentialList } from "@/components/credentials/CredentialList";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Fab } from "@/components/ui/Fab";
import { ProgressRing } from "@/components/ui/ProgressRing";
import { requireMember } from "@/lib/auth/member";
import { STAFF_ROLES } from "@/lib/auth/roles";
import { summarise, typeName } from "@/lib/credentials/logic";
import { loadStatusRows } from "@/lib/credentials/server";
import { dateFromIso, formatDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata() {
  const t = await getTranslations("Credentials");
  return { title: t("title") };
}

// CRD-04 My Credentials (ui-reference/mobile-my-credentials.png): ring with the compliance
// %, an action-led line, filter chips, one row per credential. The FAB is the one accent.
export default async function MyCredentialsPage() {
  const member = await requireMember(STAFF_ROLES);
  const t = await getTranslations("Credentials");
  const tm = await getTranslations("People.me");
  const locale = await getLocale();
  if (!member.employeeId) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-display-sm text-ink">{t("title")}</h1>
        <Card>
          <EmptyState message={tm("notLinked")} />
        </Card>
      </div>
    );
  }

  const supabase = await createClient();
  const [rows, { data: me }] = await Promise.all([
    loadStatusRows(supabase, member.employeeId),
    supabase
      .from("v_directory")
      .select("job_title, job_role_name")
      .eq("id", member.employeeId)
      .maybeSingle(),
  ]);
  const summary = summarise(rows);
  const focus = summary.focus;
  const focusName = focus ? typeName(focus.row, locale) : "";
  const advice = !focus
    ? t("ring.advice.allGood")
    : focus.kind === "expiring"
      ? t("ring.advice.expiring", {
          name: focusName,
          date: formatDate(
            dateFromIso(focus.row.expiry_date!),
            locale,
            "short",
          ),
        })
      : t(`ring.advice.${focus.kind}`, { name: focusName });

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h1 className="text-display-sm text-ink">{t("title")}</h1>
        {me?.job_role_name ? (
          <p className="text-body text-ink-muted">
            {me.job_role_name as string}
          </p>
        ) : null}
      </header>

      {summary.mandatoryTotal ? (
        <Card>
          <ProgressRing
            percent={summary.percent}
            size={88}
            headline={t("ring.headline", {
              valid: summary.mandatoryValid,
              total: summary.mandatoryTotal,
            })}
            body={advice}
          />
        </Card>
      ) : (
        <Card>
          <p className="text-body text-ink-muted">
            {me?.job_role_name ? t("ring.noneRequired") : t("noRole")}
          </p>
        </Card>
      )}

      <CredentialList
        rows={rows}
        viewHref="/staff/credentials"
        addHref="/staff/credentials/new"
      />
      <Fab label={t("add")} href="/staff/credentials/new" />
    </div>
  );
}
