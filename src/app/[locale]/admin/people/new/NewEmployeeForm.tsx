"use client";

import { useLocale, useTranslations } from "next-intl";
import { FormFeedback, useFieldError } from "@/components/forms/FormFeedback";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/Card";
import type { EmploymentRecord } from "@/lib/people/records";
import { idle } from "@/lib/settings/form";
import { useFormAction } from "@/lib/use-form-action";
import { createEmployee } from "../actions";
import {
  ContractFields,
  PlacementFields,
  type Option,
  type RoleOption,
} from "../_components/JobFields";
import { PersonalFields } from "../_components/PersonalFields";

// One accent action: Add employee. The record opens afterwards for the other tabs.
export function NewEmployeeForm({
  roles,
  branches,
  managers,
  defaults,
}: {
  roles: readonly RoleOption[];
  branches: readonly Option[];
  managers: readonly Option[];
  defaults?: Pick<
    EmploymentRecord,
    "normal_hours_per_day" | "work_days_per_week"
  >;
}) {
  const t = useTranslations("People.new");
  const locale = useLocale();
  const { state, onSubmit, pending } = useFormAction(createEmployee, idle);
  const error = useFieldError(state);

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6" noValidate>
      <input type="hidden" name="locale" value={locale} />
      <div className="flex flex-col gap-1">
        <h2 className="text-h2 text-ink">{t("title")}</h2>
        <p className="max-w-3xl text-meta text-ink-muted">{t("intro")}</p>
      </div>
      <PersonalFields error={error} />
      <Card className="flex flex-col gap-5">
        <CardHeader title={t("job")} />
        <PlacementFields
          roles={roles}
          branches={branches}
          managers={managers}
          error={error}
        />
      </Card>
      <Card className="flex flex-col gap-5">
        <CardHeader title={t("contract")} />
        <ContractFields defaults={defaults} error={error} />
      </Card>
      <div className="flex flex-col items-start gap-3 md:flex-row md:items-center">
        <Button type="submit" variant="accent" loading={pending}>
          {t("create")}
        </Button>
        <FormFeedback state={state} />
      </div>
    </form>
  );
}
