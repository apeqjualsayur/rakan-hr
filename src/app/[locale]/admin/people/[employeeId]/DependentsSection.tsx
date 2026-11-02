"use client";

import { useEffect, useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import {
  FormFeedback,
  useErrorText,
  useFieldError,
} from "@/components/forms/FormFeedback";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import { dateFromIso, formatDate } from "@/lib/format";
import { RELATIONSHIPS, type Dependent } from "@/lib/people/records";
import { idle, type FormState } from "@/lib/settings/form";
import { useFormAction } from "@/lib/use-form-action";
import { removeDependent, saveDependent } from "../actions";

// Dependents tab: spouse and children with the PCB child-relief flags.
export function DependentsSection({
  employeeId,
  dependents,
  canEdit,
}: {
  employeeId: string;
  dependents: readonly Dependent[];
  canEdit: boolean;
}) {
  const t = useTranslations("People.dependents");
  const [editing, setEditing] = useState<string | "new" | null>(null);

  return (
    <Card className="flex flex-col gap-4">
      <CardHeader
        title={t("title")}
        action={
          canEdit && editing !== "new" ? (
            <Button variant="link" onClick={() => setEditing("new")}>
              <Plus aria-hidden />
              {t("add")}
            </Button>
          ) : null
        }
      />
      <p className="-mt-2 text-meta text-ink-muted">{t("intro")}</p>
      {editing === "new" ? (
        <DependentForm
          employeeId={employeeId}
          onDone={() => setEditing(null)}
        />
      ) : null}
      {dependents.length === 0 && editing !== "new" ? (
        <EmptyState message={t("none")} className="py-2" />
      ) : (
        <ul className="divide-y divide-border">
          {dependents.map((d) =>
            editing === d.id ? (
              <li key={d.id} className="py-3">
                <DependentForm
                  employeeId={employeeId}
                  dependent={d}
                  onDone={() => setEditing(null)}
                />
              </li>
            ) : (
              <DependentRow
                key={d.id}
                dependent={d}
                canEdit={canEdit}
                onEdit={() => setEditing(d.id)}
              />
            ),
          )}
        </ul>
      )}
    </Card>
  );
}

function DependentRow({
  dependent: d,
  canEdit,
  onEdit,
}: {
  dependent: Dependent;
  canEdit: boolean;
  onEdit: () => void;
}) {
  const t = useTranslations("People.dependents");
  const locale = useLocale();
  const errorText = useErrorText();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<FormState>(idle);
  const meta = [
    t(`relationships.${d.relationship}`),
    d.date_of_birth
      ? t("born", {
          date: formatDate(dateFromIso(d.date_of_birth), locale, "full"),
        })
      : null,
    d.is_disabled ? t("is_disabled") : null,
    d.in_tertiary_education ? t("in_tertiary_education") : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <li className="flex flex-col gap-2 py-3 md:flex-row md:items-center md:gap-4">
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="text-h3 text-ink">{d.name}</p>
        <p className="text-meta text-ink-muted">{meta}</p>
        {result.status === "error" ? (
          <p role="alert" className="text-meta font-medium text-danger">
            {errorText(result.message ?? "saveFailed")}
          </p>
        ) : null}
      </div>
      {canEdit ? (
        <div className="flex gap-2">
          <Button variant="outline" size="row" onClick={onEdit}>
            {t("edit")}
          </Button>
          <Button
            variant="ghost"
            size="row"
            disabled={pending}
            onClick={() => {
              if (window.confirm(t("removeConfirm", { name: d.name })))
                startTransition(async () =>
                  setResult(await removeDependent(d.id)),
                );
            }}
          >
            {t("remove")}
          </Button>
        </div>
      ) : null}
    </li>
  );
}

function DependentForm({
  employeeId,
  dependent,
  onDone,
}: {
  employeeId: string;
  dependent?: Dependent;
  onDone: () => void;
}) {
  const t = useTranslations("People.dependents");
  const { state, onSubmit, pending } = useFormAction(saveDependent, idle);
  const error = useFieldError(state);
  const savedAt = state.status === "saved" ? state.at : null;
  useEffect(() => {
    if (savedAt !== null) onDone();
  }, [savedAt, onDone]);

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-4 rounded-tile border border-border bg-canvas p-4"
      noValidate
    >
      <input type="hidden" name="employee_id" value={employeeId} />
      {dependent ? (
        <input type="hidden" name="dependent_id" value={dependent.id} />
      ) : null}
      <div className="grid gap-4 md:grid-cols-3">
        <TextField
          label={t("name")}
          name="name"
          defaultValue={dependent?.name ?? ""}
          error={error("name")}
        />
        <SelectField
          label={t("relationship")}
          name="relationship"
          defaultValue={dependent?.relationship ?? "child"}
          error={error("relationship")}
        >
          {RELATIONSHIPS.map((r) => (
            <option key={r} value={r}>
              {t(`relationships.${r}`)}
            </option>
          ))}
        </SelectField>
        <TextField
          type="date"
          label={t("date_of_birth")}
          name="date_of_birth"
          defaultValue={dependent?.date_of_birth ?? ""}
          error={error("date_of_birth")}
        />
      </div>
      <div className="flex flex-wrap gap-x-6">
        {(["is_disabled", "in_tertiary_education"] as const).map((name) => (
          <label
            key={name}
            className="flex min-h-11 cursor-pointer items-center gap-3 text-body text-ink"
          >
            <input
              type="checkbox"
              name={name}
              defaultChecked={dependent?.[name] ?? false}
              className="size-5 accent-primary"
            />
            {t(name)}
          </label>
        ))}
      </div>
      <div className="flex flex-col items-start gap-3 md:flex-row md:items-center">
        <Button type="submit" loading={pending}>
          {t("save")}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          {t("cancel")}
        </Button>
        <FormFeedback state={state} />
      </div>
    </form>
  );
}
