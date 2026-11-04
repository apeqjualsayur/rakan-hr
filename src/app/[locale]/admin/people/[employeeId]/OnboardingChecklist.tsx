"use client";

import { useOptimistic, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { FormFeedback, useFieldError } from "@/components/forms/FormFeedback";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { TextField } from "@/components/ui/TextField";
import { dateFromIso, formatDate } from "@/lib/format";
import { addTask, deleteTask, setTaskDone } from "@/lib/hiring/actions";
import { ONBOARDING_CODES, type OnboardingTask } from "@/lib/hiring/types";
import { idle } from "@/lib/settings/form";
import { useFormAction } from "@/lib/use-form-action";
import { cn } from "@/lib/utils";

// HIR-06: tick tasks off as they are done; overdue ones are flagged. HR can add their own.
export function OnboardingChecklist({
  employeeId,
  tasks,
  canEdit,
  today,
}: {
  employeeId: string;
  tasks: readonly OnboardingTask[];
  canEdit: boolean;
  today: string;
}) {
  const t = useTranslations("Onboarding");
  const tr = useTranslations("Roles");
  const locale = useLocale();
  const [optimistic, setOptimistic] = useOptimistic(
    tasks,
    (current, change: { id: string; done: boolean }) =>
      current.map((task) =>
        task.id === change.id
          ? { ...task, done_at: change.done ? new Date().toISOString() : null }
          : task,
      ),
  );
  const [, startTransition] = useTransition();
  const { state, onSubmit, pending } = useFormAction(addTask, idle);
  const error = useFieldError(state);
  const doneCount = optimistic.filter((x) => x.done_at).length;
  const title = (task: OnboardingTask) =>
    task.code && (ONBOARDING_CODES as readonly string[]).includes(task.code)
      ? t(`tasks.${task.code as (typeof ONBOARDING_CODES)[number]}`)
      : task.title;

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-4">
        <CardHeader
          title={t("title")}
          action={
            <span className="text-meta text-ink-muted tabular-nums">
              {t("progress", { done: doneCount, total: optimistic.length })}
            </span>
          }
        />
        {optimistic.length ? (
          <ProgressBar value={doneCount} max={optimistic.length} hideLabels />
        ) : null}
        {optimistic.length === 0 ? (
          <EmptyState message={t("none")} />
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {optimistic.map((task) => {
              const overdue =
                !task.done_at &&
                task.due_date !== null &&
                task.due_date < today;
              return (
                <li key={task.id} className="flex items-center gap-3 py-3">
                  <input
                    type="checkbox"
                    id={`task-${task.id}`}
                    checked={Boolean(task.done_at)}
                    disabled={!canEdit}
                    onChange={(e) => {
                      const done = e.target.checked;
                      startTransition(async () => {
                        setOptimistic({ id: task.id, done });
                        await setTaskDone(task.id, done);
                      });
                    }}
                    className="size-5 shrink-0 accent-primary"
                  />
                  <label
                    htmlFor={`task-${task.id}`}
                    className="flex min-w-0 flex-1 cursor-pointer flex-col"
                  >
                    <span
                      className={cn(
                        "text-body text-ink",
                        task.done_at && "text-ink-muted line-through",
                      )}
                    >
                      {title(task)}
                    </span>
                    <span
                      className={cn(
                        "text-meta",
                        overdue ? "font-medium text-danger" : "text-ink-muted",
                      )}
                    >
                      {[
                        tr(`${task.owner_role as "owner"}.name`),
                        task.due_date
                          ? overdue
                            ? t("overdue", {
                                date: formatDate(
                                  dateFromIso(task.due_date),
                                  locale,
                                  "full",
                                ),
                              })
                            : t("due", {
                                date: formatDate(
                                  dateFromIso(task.due_date),
                                  locale,
                                  "full",
                                ),
                              })
                          : null,
                        task.done_at
                          ? t("doneOn", {
                              date: formatDate(
                                new Date(task.done_at),
                                locale,
                                "full",
                              ),
                            })
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </label>
                  {canEdit && !task.code ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={t("remove", { task: task.title })}
                      onClick={() =>
                        startTransition(
                          async () => void (await deleteTask(task.id)),
                        )
                      }
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      {canEdit ? (
        <Card className="flex flex-col gap-4">
          <CardHeader title={t("addTitle")} as="h3" />
          <form
            onSubmit={onSubmit}
            className="grid gap-4 md:grid-cols-[2fr_1fr_auto] md:items-end"
            noValidate
          >
            <input type="hidden" name="employee_id" value={employeeId} />
            <TextField
              label={t("taskTitle")}
              name="title"
              error={error("title")}
              required
            />
            <TextField type="date" label={t("taskDue")} name="due_date" />
            <Button type="submit" variant="outline" loading={pending}>
              {t("add")}
            </Button>
          </form>
          <FormFeedback state={state} />
        </Card>
      ) : null}
    </div>
  );
}
