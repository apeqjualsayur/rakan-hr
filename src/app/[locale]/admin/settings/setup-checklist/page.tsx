import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/Card";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { requireMember } from "@/lib/auth/member";
import { can } from "@/lib/auth/roles";
import { malaysiaToday } from "@/lib/format";
import {
  CHECKLIST_COLUMNS,
  checklistProgress,
  type ChecklistItem,
} from "@/lib/settings/checklist";
import { createClient } from "@/lib/supabase/server";
import { ChecklistItemRow } from "./ChecklistItemRow";

export async function generateMetadata() {
  const t = await getTranslations("Settings.checklist");
  return { title: t("title") };
}

// ORG-04 Employer Setup Checklist: 7 one-off registrations with status, due date and
// evidence. Deadlines count from the company's first hire / first payday dates.
export default async function SetupChecklistPage() {
  const member = await requireMember([
    "owner",
    "hr_admin",
    "payroll_approver",
    "auditor",
  ]);
  const t = await getTranslations("Settings.checklist");
  const supabase = await createClient();
  const [{ data: items }, { data: tenant }] = await Promise.all([
    supabase
      .from("setup_checklist_items")
      .select(CHECKLIST_COLUMNS)
      .order("sort_order")
      .returns<ChecklistItem[]>(),
    supabase
      .from("tenants")
      .select("first_hire_date, first_payday_date")
      .eq("id", member.tenantId!)
      .single(),
  ]);
  const list = items ?? [];
  const { done, total } = checklistProgress(list);
  const today = malaysiaToday();

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-h2 text-ink">{t("title")}</h2>
          <p className="max-w-3xl text-meta text-ink-muted">{t("intro")}</p>
        </div>
        <ProgressBar
          value={done}
          max={total}
          label={t("progress")}
          valueLabel={t("progressValue", { done, total })}
        />
      </Card>

      <Card className="flex flex-col">
        <ul className="divide-y divide-border">
          {list.map((item) => (
            <ChecklistItemRow
              key={item.id}
              item={item}
              today={today}
              tenantId={member.tenantId!}
              hasFirstHire={Boolean(tenant?.first_hire_date)}
              hasFirstPayday={Boolean(tenant?.first_payday_date)}
              canEdit={can(member.role, "editChecklist")}
              canEditDates={can(member.role, "editCompany")}
            />
          ))}
        </ul>
      </Card>
    </div>
  );
}
