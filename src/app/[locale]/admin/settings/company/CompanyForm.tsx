"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/Card";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import { MALAYSIAN_STATES } from "@/lib/malaysia";
import type { CompanyValues } from "@/lib/settings/company";
import { idle } from "@/lib/settings/form";
import { useFormAction } from "@/lib/use-form-action";
import {
  FormFeedback,
  ReadOnlyNote,
  useFieldError,
} from "@/components/forms/FormFeedback";
import { saveCompany } from "./actions";

type TextName = Exclude<
  keyof CompanyValues,
  "is_msme" | "state_code" | "first_hire_date" | "first_payday_date"
>;

// ORG-01 company profile and ORG-02 employer numbers. One accent action: Save changes.
export function CompanyForm({
  company,
  canEdit,
}: {
  company: CompanyValues | null;
  canEdit: boolean;
}) {
  const t = useTranslations("Settings.company");
  const ts = useTranslations("Settings");
  const { state, onSubmit, pending } = useFormAction(saveCompany, idle);
  const error = useFieldError(state);

  const text = (name: TextName, hint?: string) => (
    <TextField
      label={t(name)}
      name={name}
      defaultValue={company?.[name] ?? ""}
      hint={hint}
      error={error(name)}
      autoComplete="off"
    />
  );

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6" noValidate>
      {canEdit ? null : <ReadOnlyNote who="owner" />}
      <fieldset disabled={!canEdit} className="flex min-w-0 flex-col gap-6">
        <Card className="flex flex-col gap-5">
          <CardHeader title={t("profile")} />
          <p className="-mt-3 text-meta text-ink-muted">{t("intro")}</p>
          <div className="grid gap-5 md:grid-cols-2">
            {text("legal_name", t("legal_nameHint"))}
            {text("trading_name", t("trading_nameHint"))}
            {text("ssm_no", t("ssm_noHint"))}
            <SelectField
              label={t("state_code")}
              name="state_code"
              defaultValue={company?.state_code ?? ""}
              hint={t("state_codeHint")}
              error={error("state_code")}
            >
              <option value="">{t("statePlaceholder")}</option>
              {MALAYSIAN_STATES.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.name}
                </option>
              ))}
            </SelectField>
            <div className="md:col-span-2">{text("address")}</div>
          </div>
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-2 text-label text-ink">{t("is_msme")}</legend>
            {(["yes", "no"] as const).map((value) => (
              <label
                key={value}
                className="flex min-h-11 cursor-pointer items-center gap-3 text-body text-ink"
              >
                <input
                  type="radio"
                  name="is_msme"
                  value={value}
                  defaultChecked={
                    (company?.is_msme ?? true) === (value === "yes")
                  }
                  className="size-5 accent-primary"
                />
                {value === "yes" ? t("msmeYes") : t("msmeNo")}
              </label>
            ))}
            <p className="text-meta text-ink-muted">{t("is_msmeHint")}</p>
          </fieldset>
        </Card>

        <Card className="flex flex-col gap-5">
          <CardHeader title={t("dates")} />
          <p className="-mt-3 text-meta text-ink-muted">{t("datesIntro")}</p>
          <div className="grid gap-5 md:grid-cols-2">
            <TextField
              type="date"
              label={t("first_hire_date")}
              name="first_hire_date"
              defaultValue={company?.first_hire_date ?? ""}
              hint={t("first_hire_dateHint")}
              error={error("first_hire_date")}
            />
            <TextField
              type="date"
              label={t("first_payday_date")}
              name="first_payday_date"
              defaultValue={company?.first_payday_date ?? ""}
              hint={t("first_payday_dateHint")}
              error={error("first_payday_date")}
            />
          </div>
        </Card>

        <Card className="flex flex-col gap-5">
          <CardHeader title={t("employer")} />
          <p className="-mt-3 text-meta text-ink-muted">{t("employerIntro")}</p>
          <div className="grid gap-5 md:grid-cols-2">
            {text("epf_employer_no")}
            {text("socso_employer_code")}
            {text("lhdn_e_no")}
            {text("hrdcorp_no", t("hrdcorp_noHint"))}
          </div>
        </Card>
      </fieldset>

      {canEdit ? (
        <div className="flex flex-col items-start gap-3 md:flex-row md:items-center">
          <Button type="submit" variant="accent" loading={pending}>
            {ts("save")}
          </Button>
          <FormFeedback state={state} />
        </div>
      ) : null}
    </form>
  );
}
