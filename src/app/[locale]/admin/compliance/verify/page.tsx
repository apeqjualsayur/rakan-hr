import { ChevronRight } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/Card";
import { CategoryTag } from "@/components/ui/CategoryTag";
import { EmptyState } from "@/components/ui/EmptyState";
import { Link } from "@/i18n/navigation";
import { requireMember } from "@/lib/auth/member";
import { typeName } from "@/lib/credentials/logic";
import { formatDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata() {
  const t = await getTranslations("Compliance.nav");
  return { title: t("verify") };
}

// CRD-09 verification queue, oldest first.
export default async function VerifyQueuePage() {
  await requireMember(["owner", "hr_admin"]);
  const t = await getTranslations("Compliance.verify");
  const locale = await getLocale();
  const supabase = await createClient();
  const { data: pending } = await supabase
    .from("staff_credentials")
    .select(
      "id, employee_id, submitted_at, approval_id, credential_types (name_en, name_ms), employees (full_name), credential_files (id)",
    )
    .eq("status", "pending")
    .order("submitted_at");

  type Row = {
    id: string;
    submitted_at: string | null;
    approval_id: string | null;
    credential_types: { name_en: string; name_ms: string } | null;
    employees: { full_name: string } | null;
    credential_files: { id: string }[];
  };
  const rows = (pending ?? []) as unknown as Row[];

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-3xl text-meta text-ink-muted">{t("intro")}</p>
      <Card className="flex flex-col">
        {rows.length === 0 ? (
          <EmptyState message={t("none")} />
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/admin/compliance/credentials/${r.id}`}
                  className="-mx-2 flex items-center gap-4 rounded-tile px-2 py-3 transition-colors hover:bg-canvas"
                >
                  <CategoryTag
                    category="credential"
                    className="hidden md:inline-flex"
                  />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-h3 text-ink">
                      {r.employees?.full_name} ·{" "}
                      {r.credential_types
                        ? typeName(r.credential_types, locale)
                        : ""}
                    </span>
                    <span className="text-meta text-ink-muted">
                      {[
                        r.submitted_at
                          ? t("submitted", {
                              date: formatDate(
                                new Date(r.submitted_at),
                                locale,
                                "full",
                              ),
                            })
                          : null,
                        r.approval_id ? null : t("byHr"),
                        t("files", { count: r.credential_files.length }),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  <span className="text-label text-primary">{t("review")}</span>
                  <ChevronRight
                    aria-hidden
                    size={20}
                    strokeWidth={1.75}
                    className="text-ink-muted"
                  />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
