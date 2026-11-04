import { ChevronRight } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/Card";
import { Link } from "@/i18n/navigation";
import { requireMember } from "@/lib/auth/member";
import { formatDate } from "@/lib/format";
import { LETTER_KINDS } from "@/lib/hiring/letters";
import { TEMPLATE_COLUMNS, type LetterTemplate } from "@/lib/hiring/types";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata() {
  const t = await getTranslations("Settings.nav");
  return { title: t("letters") };
}

// HIR-03 Settings > Letter templates: offer, contract, confirmation and extension, each in
// English and Bahasa Malaysia. Placeholder wording is marked Draft until it is replaced.
export default async function LettersPage() {
  await requireMember(["owner", "hr_admin", "auditor"]);
  const t = await getTranslations("Letters");
  const locale = await getLocale();
  const supabase = await createClient();
  const { data } = await supabase
    .from("letter_templates")
    .select(TEMPLATE_COLUMNS)
    .returns<LetterTemplate[]>();
  const templates = data ?? [];
  const drafts = templates.filter((x) => x.is_draft).length;

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-3xl text-body text-ink-muted">{t("intro")}</p>
      {drafts > 0 ? (
        <p className="max-w-3xl rounded-tile bg-warning-tint px-4 py-3 text-meta text-warning">
          {t("draftWarning", { count: drafts })}
        </p>
      ) : null}
      <Card className="flex flex-col">
        <ul className="divide-y divide-border">
          {LETTER_KINDS.flatMap((kind) =>
            (["en", "ms"] as const).map((lang) => {
              const tpl = templates.find(
                (x) => x.kind === kind && x.locale === lang,
              );
              if (!tpl) return null;
              return (
                <li key={tpl.id}>
                  <Link
                    href={`/admin/settings/letters/${tpl.id}`}
                    className="-mx-2 flex items-center gap-4 rounded-tile px-2 py-3 transition-colors hover:bg-canvas"
                  >
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="text-h3 text-ink">
                        {t(`kinds.${kind}`)} · {t(`locales.${lang}`)}
                      </span>
                      <span className="text-meta text-ink-muted">
                        {tpl.title} ·{" "}
                        {t("updated", {
                          date: formatDate(
                            new Date(tpl.updated_at),
                            locale,
                            "full",
                          ),
                        })}
                      </span>
                    </span>
                    {tpl.is_draft ? (
                      <span className="inline-flex min-h-7 items-center rounded-full bg-warning-tint px-3 text-label text-warning">
                        {t("draft")}
                      </span>
                    ) : (
                      <span className="inline-flex min-h-7 items-center rounded-full bg-primary-tint px-3 text-label text-primary-strong">
                        {t("final")}
                      </span>
                    )}
                    <ChevronRight
                      aria-hidden
                      size={20}
                      strokeWidth={1.75}
                      className="shrink-0 text-ink-soft"
                    />
                  </Link>
                </li>
              );
            }),
          )}
        </ul>
      </Card>
    </div>
  );
}
