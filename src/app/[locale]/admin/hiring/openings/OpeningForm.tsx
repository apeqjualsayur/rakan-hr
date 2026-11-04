"use client";

import { useLocale, useTranslations } from "next-intl";
import { FormFeedback, useFieldError } from "@/components/forms/FormFeedback";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/Card";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import { saveOpening } from "@/lib/hiring/actions";
import { OPENING_STATUSES, type JobOpening } from "@/lib/hiring/types";
import { EMPLOYMENT_TYPES, PAY_MODELS } from "@/lib/people/records";
import { idle } from "@/lib/settings/form";
import { useFormAction } from "@/lib/use-form-action";

// HIR-01: title, role, employment type, pay model, salary range (and branch, status).
export function OpeningForm({
  opening,
  roles,
  branches,
  canEdit,
}: {
  opening?: JobOpening;
  roles: readonly { id: string; name: string }[];
  branches: readonly { id: string; name: string | null }[];
  canEdit: boolean;
}) {
  const t = useTranslations("Hiring.openingFields");
  const tp = useTranslations("People.employment");
  const ts = useTranslations("Status.opening");
  const locale = useLocale();
  const { state, onSubmit, pending } = useFormAction(saveOpening, idle);
  const error = useFieldError(state);

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="locale" value={locale} />
      {opening ? (
        <input type="hidden" name="opening_id" value={opening.id} />
      ) : null}
      <Card className="flex flex-col gap-5">
        <fieldset disabled={!canEdit} className="grid gap-5 md:grid-cols-2">
          <TextField
            className="md:col-span-2"
            label={t("title")}
            name="title"
            defaultValue={opening?.title ?? ""}
            error={error("title")}
            required
          />
          <SelectField
            label={t("job_role_id")}
            name="job_role_id"
            defaultValue={opening?.job_role_id ?? ""}
            hint={t("job_role_hint")}
            error={error("job_role_id")}
          >
            <option value="">{t("noRole")}</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </SelectField>
          <SelectField
            label={t("branch_id")}
            name="branch_id"
            defaultValue={opening?.branch_id ?? ""}
            error={error("branch_id")}
          >
            <option value="">{t("anyBranch")}</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name ?? t("unnamedBranch")}
              </option>
            ))}
          </SelectField>
          <SelectField
            label={t("employment_type")}
            name="employment_type"
            defaultValue={opening?.employment_type ?? "full_time"}
            error={error("employment_type")}
          >
            {EMPLOYMENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {tp(`employmentTypes.${type}`)}
              </option>
            ))}
          </SelectField>
          <SelectField
            label={t("pay_model")}
            name="pay_model"
            defaultValue={opening?.pay_model ?? "monthly"}
            error={error("pay_model")}
          >
            {PAY_MODELS.map((model) => (
              <option key={model} value={model}>
                {tp(`payModels.${model}`)}
              </option>
            ))}
          </SelectField>
          <TextField
            label={t("salary_min")}
            name="salary_min"
            inputMode="decimal"
            defaultValue={opening?.salary_min ?? ""}
            error={error("salary_min")}
            className="tabular-nums"
          />
          <TextField
            label={t("salary_max")}
            name="salary_max"
            inputMode="decimal"
            defaultValue={opening?.salary_max ?? ""}
            error={error("salary_max")}
            className="tabular-nums"
          />
          <SelectField
            label={t("status")}
            name="status"
            defaultValue={opening?.status ?? "open"}
            error={error("status")}
          >
            {OPENING_STATUSES.map((status) => (
              <option key={status} value={status}>
                {ts(status)}
              </option>
            ))}
          </SelectField>
          <TextField
            className="md:col-span-2"
            label={t("notes")}
            name="notes"
            defaultValue={opening?.notes ?? ""}
            error={error("notes")}
          />
        </fieldset>
      </Card>
      {canEdit ? (
        <div className="flex flex-col items-start gap-3">
          <Button type="submit" variant="accent" loading={pending}>
            {opening ? t("save") : t("create")}
          </Button>
          <FormFeedback state={state} />
        </div>
      ) : null}
    </form>
  );
}
