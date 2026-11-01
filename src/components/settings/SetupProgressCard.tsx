import { getLocale, getTranslations } from "next-intl/server";
import { Card, CardHeader } from "@/components/ui/Card";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Link } from "@/i18n/navigation";
import { dateFromIso, formatDate, malaysiaToday } from "@/lib/format";
import {
  CHECKLIST_COLUMNS,
  checklistProgress,
  isChecklistCode,
  isOverdue,
  nextItem,
  type ChecklistItem,
} from "@/lib/settings/checklist";
import { createClient } from "@/lib/supabase/server";

// ORG-04 progress card on Owner home ("Employer setup 5 of 7", ui-system.md §4 Progress
// bar). Renders nothing for roles that cannot read the checklist (RLS returns no rows).
export async function SetupProgressCard() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("setup_checklist_items")
    .select(CHECKLIST_COLUMNS)
    .returns<ChecklistItem[]>();
  const items = data ?? [];
  if (items.length === 0) return null;

  const t = await getTranslations("Settings.checklist");
  const locale = await getLocale();
  const today = malaysiaToday();
  const { done, total } = checklistProgress(items);
  const overdue = items.filter((i) => isOverdue(i, today)).length;
  const next = nextItem(items);
  const nextTitle = next
    ? isChecklistCode(next.code)
      ? t(`items.${next.code}.title`)
      : next.title
    : null;

  return (
    <Card className="flex flex-col gap-5">
      <CardHeader
        title={t("cardTitle")}
        action={
          <Link
            href="/admin/settings/setup-checklist"
            className="text-label text-primary underline-offset-4 hover:underline"
          >
            {t("open")}
          </Link>
        }
      />
      <ProgressBar
        value={done}
        max={total}
        label={t("progress")}
        valueLabel={t("progressValue", { done, total })}
      />
      <div className="flex flex-col gap-1">
        {next ? (
          <p className="text-body text-ink">
            {t("nextUp", { title: nextTitle ?? "" })}
          </p>
        ) : (
          <p className="text-body text-ink">{t("allDone")}</p>
        )}
        {next?.due_date ? (
          <p className="text-meta text-ink-muted">
            {t("due", {
              date: formatDate(dateFromIso(next.due_date), locale, "full"),
            })}
          </p>
        ) : null}
        {overdue > 0 ? (
          <p className="text-meta font-medium text-danger">
            {t("overdueCount", { count: overdue })}
          </p>
        ) : null}
      </div>
    </Card>
  );
}
