import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { malaysiaToday } from "@/lib/format";
import { TASK_COLUMNS, type OnboardingTask } from "@/lib/hiring/types";
import { createClient } from "@/lib/supabase/server";
import { OnboardingChecklist } from "./OnboardingChecklist";

// HIR-06 onboarding checklist, created by Convert to employee.
export async function OnboardingTab({
  employeeId,
  canEdit,
}: {
  employeeId: string;
  canEdit: boolean;
}) {
  const t = await getTranslations("Onboarding");
  const supabase = await createClient();
  const { data } = await supabase
    .from("onboarding_tasks")
    .select(TASK_COLUMNS)
    .eq("employee_id", employeeId)
    .order("sort_order")
    .order("created_at")
    .returns<OnboardingTask[]>();
  const tasks = data ?? [];
  if (tasks.length === 0 && !canEdit)
    return (
      <Card>
        <EmptyState message={t("none")} />
      </Card>
    );
  return (
    <OnboardingChecklist
      employeeId={employeeId}
      tasks={tasks}
      canEdit={canEdit}
      today={malaysiaToday()}
    />
  );
}
