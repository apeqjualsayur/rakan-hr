"use client";

import { useTranslations } from "next-intl";
import { FormFeedback, useFieldError } from "@/components/forms/FormFeedback";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/Card";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import { PCB_CATEGORIES, type Employee } from "@/lib/people/employee";
import { idle } from "@/lib/settings/form";
import { useFormAction } from "@/lib/use-form-action";
import { saveStatutory } from "../actions";

// Statutory tab (EMP-04): EPF / SOCSO / tax numbers, EIS cover, PCB inputs and zakat.
// Rates are not here: they come from the versioned statutory tables at payroll time.
export function StatutoryForm({
  employee,
  eisDefault,
  canEdit,
}: {
  employee: Employee;
  /** What "Automatic" means for this person today (null = needs a date of birth). */
  eisDefault: boolean | null;
  canEdit: boolean;
}) {
  const t = useTranslations("People.statutory");
  const { state, onSubmit, pending } = useFormAction(saveStatutory, idle);
  const error = useFieldError(state);
  const autoValue = t(
    `eisDefault.${eisDefault === null ? "unknown" : eisDefault ? "yes" : "no"}`,
  );

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6" noValidate>
      <input type="hidden" name="employee_id" value={employee.id} />
      <fieldset disabled={!canEdit} className="flex min-w-0 flex-col gap-6">
        <Card className="flex flex-col gap-5">
          <CardHeader title={t("numbers")} />
          <p className="-mt-3 text-meta text-ink-muted">{t("intro")}</p>
          <div className="grid gap-5 md:grid-cols-3">
            <TextField
              label={t("epf_no")}
              name="epf_no"
              defaultValue={employee.epf_no ?? ""}
              error={error("epf_no")}
              autoComplete="off"
            />
            <TextField
              label={t("socso_no")}
              name="socso_no"
              defaultValue={employee.socso_no ?? ""}
              hint={t("socso_noHint")}
              error={error("socso_no")}
              autoComplete="off"
            />
            <TextField
              label={t("tax_no")}
              name="tax_no"
              defaultValue={employee.tax_no ?? ""}
              error={error("tax_no")}
              autoComplete="off"
            />
          </div>
        </Card>

        <Card className="flex flex-col gap-5">
          <CardHeader title={t("eis")} />
          <SelectField
            className="md:max-w-md"
            label={t("eis_eligible")}
            name="eis_eligible"
            defaultValue={
              employee.eis_eligible === null
                ? "auto"
                : employee.eis_eligible
                  ? "yes"
                  : "no"
            }
            hint={t("eisHint")}
            error={error("eis_eligible")}
          >
            <option value="auto">{t("eisAuto", { value: autoValue })}</option>
            <option value="yes">{t("eisYes")}</option>
            <option value="no">{t("eisNo")}</option>
          </SelectField>
        </Card>

        <Card className="flex flex-col gap-5">
          <CardHeader title={t("pcb")} />
          <div className="grid gap-5 md:grid-cols-3">
            <SelectField
              label={t("pcb_category")}
              name="pcb_category"
              defaultValue={employee.pcb_category ?? ""}
              error={error("pcb_category")}
            >
              <option value="">—</option>
              {PCB_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {t(`pcbCategories.${c}`)}
                </option>
              ))}
            </SelectField>
            <TextField
              type="number"
              min={0}
              max={99}
              label={t("children_count_eligible")}
              name="children_count_eligible"
              defaultValue={employee.children_count_eligible}
              hint={t("children_count_eligibleHint")}
              error={error("children_count_eligible")}
            />
            <TextField
              label={t("zakat_monthly")}
              name="zakat_monthly"
              inputMode="decimal"
              defaultValue={employee.zakat_monthly ?? ""}
              hint={t("zakat_monthlyHint")}
              error={error("zakat_monthly")}
            />
          </div>
        </Card>
      </fieldset>
      {canEdit ? (
        <div className="flex flex-col items-start gap-3 md:flex-row md:items-center">
          <Button type="submit" variant="accent" loading={pending}>
            {t("save")}
          </Button>
          <FormFeedback state={state} />
        </div>
      ) : null}
    </form>
  );
}
