import { getLocale, getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { requireMember } from "@/lib/auth/member";
import { typeName } from "@/lib/credentials/logic";
import { createClient } from "@/lib/supabase/server";
import { CpdReviewRow, type CpdReview } from "./CpdReviewRow";

export async function generateMetadata() {
  const t = await getTranslations("Compliance.nav");
  return { title: t("cpd") };
}

// CRD-18: CPD activities waiting for HR, oldest first.
export default async function CpdQueuePage() {
  await requireMember(["owner", "hr_admin"]);
  const t = await getTranslations("Compliance.cpd");
  const locale = await getLocale();
  const supabase = await createClient();
  const { data } = await supabase
    .from("cpd_activities")
    .select(
      "id, title, provider, activity_date, points, category, file_path, employees (full_name), credential_types (name_en, name_ms)",
    )
    .eq("status", "pending")
    .order("created_at");
  type Row = Omit<CpdReview, "employeeName" | "typeName"> & {
    employees: { full_name: string } | null;
    credential_types: { name_en: string; name_ms: string } | null;
  };
  const rows: CpdReview[] = ((data ?? []) as unknown as Row[]).map(
    ({ employees, credential_types, ...a }) => ({
      ...a,
      employeeName: employees?.full_name ?? "",
      typeName: credential_types ? typeName(credential_types, locale) : "",
    }),
  );

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-3xl text-meta text-ink-muted">{t("intro")}</p>
      <Card className="flex flex-col">
        {rows.length === 0 ? (
          <EmptyState message={t("none")} />
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((a) => (
              <CpdReviewRow key={a.id} activity={a} />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
