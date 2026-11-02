"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import { EMPLOYEE_STATUSES, type Employee } from "@/lib/people/employee";
import {
  EMPLOYMENT_TYPES,
  PAY_MODELS,
  RATE_FIELD,
  type EmploymentRecord,
} from "@/lib/people/records";

export type RoleOption = { id: string; name: string; is_clinical: boolean };
export type Option = { id: string; name: string | null };

type ErrorFn = (name: string) => string | undefined;

// EMP-03, where the person sits: job role (clinical / non-clinical), title, branch,
// manager (drives the org chart) and status.
export function PlacementFields({
  employee,
  roles,
  branches,
  managers,
  error,
}: {
  employee?: Pick<
    Employee,
    "job_role_id" | "job_title" | "branch_id" | "manager_id" | "status"
  > | null;
  roles: readonly RoleOption[];
  branches: readonly Option[];
  /** Everyone who can be chosen as manager (not the employee themself). */
  managers: readonly Option[];
  error: ErrorFn;
}) {
  const t = useTranslations("People.employment");
  const tp = useTranslations("People");
  const ts = useTranslations("Status.employee");
  return (
    <div className="grid gap-5 md:grid-cols-2">
      <SelectField
        label={t("job_role_id")}
        name="job_role_id"
        defaultValue={employee?.job_role_id ?? ""}
        hint={t("job_roleHint")}
        error={error("job_role_id")}
      >
        <option value="">{tp("noRole")}</option>
        {roles.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name} ({r.is_clinical ? tp("clinical") : tp("nonClinical")})
          </option>
        ))}
      </SelectField>
      <TextField
        label={t("job_title")}
        name="job_title"
        defaultValue={employee?.job_title ?? ""}
        hint={t("job_titleHint")}
        error={error("job_title")}
      />
      <SelectField
        label={t("branch_id")}
        name="branch_id"
        defaultValue={
          employee?.branch_id ?? (branches.length === 1 ? branches[0]!.id : "")
        }
        error={error("branch_id")}
      >
        <option value="">{tp("noBranch")}</option>
        {branches.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name ?? tp("unnamedBranch")}
          </option>
        ))}
      </SelectField>
      <SelectField
        label={t("manager_id")}
        name="manager_id"
        defaultValue={employee?.manager_id ?? ""}
        error={error("manager_id")}
      >
        <option value="">{t("noManager")}</option>
        {managers.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </SelectField>
      <SelectField
        label={t("status")}
        name="status"
        defaultValue={employee?.status ?? "active"}
        error={error("status")}
      >
        {EMPLOYEE_STATUSES.map((s) => (
          <option key={s} value={s}>
            {ts(s)}
          </option>
        ))}
      </SelectField>
    </div>
  );
}

// EMP-03 contract and pay: one employment record. Only the rate for the chosen pay model
// is shown and saved.
export function ContractFields({
  record,
  defaults,
  error,
}: {
  record?: Partial<EmploymentRecord> | null;
  /** Hours and days to suggest for a new contract (the company's usual pattern). */
  defaults?: Pick<
    EmploymentRecord,
    "normal_hours_per_day" | "work_days_per_week"
  >;
  error: ErrorFn;
}) {
  const t = useTranslations("People.employment");
  const [payModel, setPayModel] = useState(record?.pay_model ?? "monthly");
  const rateField = RATE_FIELD[payModel];
  return (
    <div className="grid gap-5 md:grid-cols-2">
      <SelectField
        label={t("employment_type")}
        name="employment_type"
        defaultValue={record?.employment_type ?? "full_time"}
        error={error("employment_type")}
      >
        {EMPLOYMENT_TYPES.map((type) => (
          <option key={type} value={type}>
            {t(`employmentTypes.${type}`)}
          </option>
        ))}
      </SelectField>
      <SelectField
        label={t("pay_model")}
        name="pay_model"
        value={payModel}
        onChange={(e) => setPayModel(e.target.value as typeof payModel)}
        error={error("pay_model")}
      >
        {PAY_MODELS.map((model) => (
          <option key={model} value={model}>
            {t(`payModels.${model}`)}
          </option>
        ))}
      </SelectField>
      <TextField
        key={rateField}
        label={t(rateField)}
        name={rateField}
        inputMode="decimal"
        defaultValue={record?.[rateField] ?? ""}
        error={error(rateField)}
        className="tabular-nums"
      />
      <div className="grid grid-cols-2 gap-5">
        <TextField
          label={t("normal_hours_per_day")}
          name="normal_hours_per_day"
          inputMode="decimal"
          defaultValue={
            record?.normal_hours_per_day ?? defaults?.normal_hours_per_day ?? ""
          }
          error={error("normal_hours_per_day")}
        />
        <TextField
          label={t("work_days_per_week")}
          name="work_days_per_week"
          inputMode="decimal"
          defaultValue={
            record?.work_days_per_week ?? defaults?.work_days_per_week ?? ""
          }
          error={error("work_days_per_week")}
        />
      </div>
      <TextField
        type="date"
        label={t("start_date")}
        name="start_date"
        defaultValue={record?.start_date ?? ""}
        error={error("start_date")}
        required
      />
      <TextField
        type="date"
        label={t("end_date")}
        name="end_date"
        defaultValue={record?.end_date ?? ""}
        hint={t("end_dateHint")}
        error={error("end_date")}
      />
      <TextField
        type="date"
        label={t("probation_end")}
        name="probation_end"
        defaultValue={record?.probation_end ?? ""}
        error={error("probation_end")}
      />
      <TextField
        type="date"
        label={t("confirmed_on")}
        name="confirmed_on"
        defaultValue={record?.confirmed_on ?? ""}
        error={error("confirmed_on")}
      />
    </div>
  );
}
