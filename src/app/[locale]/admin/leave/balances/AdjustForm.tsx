"use client";

import { useTranslations } from "next-intl";
import { FormFeedback, useFieldError } from "@/components/forms/FormFeedback";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/Card";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import { adjustBalance } from "@/lib/leave/actions";
import { idle } from "@/lib/settings/form";
import { useFormAction } from "@/lib/use-form-action";

// Add or take away days (e.g. replacement leave earned for holiday work), with a reason.
export function AdjustForm({
  people,
  types,
  year,
}: {
  people: readonly { id: string; full_name: string }[];
  types: readonly { id: string; name: string }[];
  year: number;
}) {
  const t = useTranslations("Leave.balances");
  const { state, onSubmit, pending } = useFormAction(adjustBalance, idle);
  const error = useFieldError(state);
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="year" value={year} />
      <Card className="flex flex-col gap-5">
        <SelectField
          label={t("person")}
          name="employee_id"
          defaultValue=""
          error={error("employee_id")}
        >
          <option value="">{t("choose")}</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.full_name}
            </option>
          ))}
        </SelectField>
        <SelectField
          label={t("type")}
          name="leave_type_id"
          defaultValue={types[0]?.id ?? ""}
        >
          {types.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </SelectField>
        <TextField
          label={t("days")}
          name="days"
          inputMode="decimal"
          hint={t("daysHint")}
          error={error("days")}
        />
        <TextField label={t("note")} name="note" error={error("note")} />
      </Card>
      <div className="flex flex-col items-start gap-3">
        <Button type="submit" variant="outline" loading={pending}>
          {t("adjust")}
        </Button>
        <FormFeedback state={state} />
      </div>
    </form>
  );
}
