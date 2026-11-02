"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { FormFeedback, useFieldError } from "@/components/forms/FormFeedback";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Link } from "@/i18n/navigation";
import { dateFromIso, formatDate, formatMoney } from "@/lib/format";
import type { Employee } from "@/lib/people/employee";
import { RATE_FIELD, type EmploymentRecord } from "@/lib/people/records";
import { idle } from "@/lib/settings/form";
import { useFormAction } from "@/lib/use-form-action";
import { saveContract, savePlacement } from "../actions";
import {
  ContractFields,
  PlacementFields,
  type Option,
  type RoleOption,
} from "../_components/JobFields";

// Employment tab (EMP-03): where the person sits (one accent: Save job details), then the
// current contract and its history.
export function EmploymentSection({
  employee,
  records,
  roles,
  branches,
  managers,
  defaults,
  canEdit,
}: {
  employee: Employee;
  records: readonly EmploymentRecord[];
  roles: readonly RoleOption[];
  branches: readonly Option[];
  managers: readonly Option[];
  defaults?: Pick<
    EmploymentRecord,
    "normal_hours_per_day" | "work_days_per_week"
  >;
  canEdit: boolean;
}) {
  const t = useTranslations("People.employment");
  const { state, onSubmit, pending } = useFormAction(savePlacement, idle);
  const error = useFieldError(state);
  const current = records.find((r) => r.is_current) ?? null;
  const history = records.filter((r) => !r.is_current);

  return (
    <>
      <form onSubmit={onSubmit} noValidate>
        <input type="hidden" name="employee_id" value={employee.id} />
        <Card className="flex flex-col gap-5">
          <CardHeader title={t("job")} />
          <fieldset disabled={!canEdit} className="min-w-0">
            <PlacementFields
              employee={employee}
              roles={roles}
              branches={branches}
              managers={managers}
              error={error}
            />
          </fieldset>
          {canEdit ? (
            <div className="flex flex-col items-start gap-3 md:flex-row md:items-center">
              <Button type="submit" variant="accent" loading={pending}>
                {t("saveJob")}
              </Button>
              <FormFeedback state={state} />
            </div>
          ) : null}
        </Card>
      </form>

      <ContractCard
        employeeId={employee.id}
        current={current}
        defaults={defaults}
        canEdit={canEdit}
      />

      {history.length ? (
        <Card className="flex flex-col gap-2">
          <CardHeader title={t("history")} />
          <ul className="divide-y divide-border">
            {history.map((r) => (
              <ContractSummary key={r.id} record={r} />
            ))}
          </ul>
        </Card>
      ) : null}
    </>
  );
}

function ContractCard({
  employeeId,
  current,
  defaults,
  canEdit,
}: {
  employeeId: string;
  current: EmploymentRecord | null;
  defaults?: Pick<
    EmploymentRecord,
    "normal_hours_per_day" | "work_days_per_week"
  >;
  canEdit: boolean;
}) {
  const t = useTranslations("People.employment");
  const [startingNew, setStartingNew] = useState(false);
  const editing = startingNew || !current ? null : current;

  return (
    <Card className="flex flex-col gap-5">
      <CardHeader
        title={startingNew ? t("newContract") : t("contract")}
        action={
          canEdit && current && !startingNew ? (
            <Button variant="link" onClick={() => setStartingNew(true)}>
              <Plus aria-hidden />
              {t("newContract")}
            </Button>
          ) : null
        }
      />
      {startingNew ? (
        <p className="-mt-3 text-meta text-ink-muted">{t("newContractHint")}</p>
      ) : null}
      {!current && !canEdit ? (
        <p className="text-body text-ink-muted">{t("noContract")}</p>
      ) : (
        <ContractForm
          // Remount so a new contract starts from blank dates.
          key={editing?.id ?? "new"}
          employeeId={employeeId}
          record={editing}
          defaults={defaults}
          canEdit={canEdit}
          onCancel={startingNew ? () => setStartingNew(false) : undefined}
          onSaved={() => setStartingNew(false)}
        />
      )}
    </Card>
  );
}

function ContractForm({
  employeeId,
  record,
  defaults,
  canEdit,
  onCancel,
  onSaved,
}: {
  employeeId: string;
  record: EmploymentRecord | null;
  defaults?: Pick<
    EmploymentRecord,
    "normal_hours_per_day" | "work_days_per_week"
  >;
  canEdit: boolean;
  onCancel?: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("People.employment");
  const { state, onSubmit, pending } = useFormAction(
    async (prev: typeof idle, data: FormData) => {
      const result = await saveContract(prev, data);
      if (result.status === "saved") onSaved();
      return result;
    },
    idle,
  );
  const error = useFieldError(state);
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
      <input type="hidden" name="employee_id" value={employeeId} />
      {record ? (
        <input type="hidden" name="record_id" value={record.id} />
      ) : null}
      <fieldset disabled={!canEdit} className="min-w-0">
        <ContractFields record={record} defaults={defaults} error={error} />
      </fieldset>
      {canEdit ? (
        <div className="flex flex-col items-start gap-3 md:flex-row md:items-center">
          <Button type="submit" loading={pending}>
            {record ? t("saveContract") : t("addFirstContract")}
          </Button>
          {onCancel ? (
            <Button type="button" variant="ghost" onClick={onCancel}>
              {t("cancelNew")}
            </Button>
          ) : null}
          <FormFeedback state={state} />
        </div>
      ) : null}
    </form>
  );
}

function ContractSummary({ record }: { record: EmploymentRecord }) {
  const t = useTranslations("People.employment");
  const locale = useLocale();
  const day = (iso: string) => formatDate(dateFromIso(iso), locale, "full");
  const rate = record[RATE_FIELD[record.pay_model]];
  const rateText = rate
    ? t(
        record.pay_model === "monthly"
          ? "rateMonthly"
          : record.pay_model === "hourly"
            ? "rateHourly"
            : "rateSession",
        { amount: formatMoney(rate) },
      )
    : null;
  return (
    <li className="flex flex-col gap-1 py-3">
      <p className="text-body font-semibold text-ink">
        {t(`employmentTypes.${record.employment_type}`)}
        {rateText ? ` · ${rateText}` : null}
      </p>
      <p className="text-meta text-ink-muted tabular-nums">
        {t("period", {
          start: day(record.start_date),
          end: record.end_date ? day(record.end_date) : t("ongoing"),
        })}
      </p>
    </li>
  );
}

/** Whether this employee can sign in to Rakan, and how to give them access. */
export function AccountCard({
  workEmail,
  account,
}: {
  workEmail: string | null;
  account: { email: string | null; signedIn: boolean; active: boolean } | null;
}) {
  const t = useTranslations("People.employee.account");
  const text = account?.active
    ? account.signedIn
      ? t("linked", { email: account.email ?? "" })
      : t("invited", { email: account.email ?? "" })
    : workEmail
      ? t("none", { email: workEmail })
      : t("noEmail");
  return (
    <Card className="flex flex-col gap-2">
      <CardHeader title={t("title")} as="h3" />
      <p className="text-meta text-ink-soft">{text}</p>
      {account?.active ? null : (
        <Link
          href="/admin/settings/users"
          className="w-fit text-label text-primary underline-offset-4 hover:underline"
        >
          {t("users")}
        </Link>
      )}
    </Card>
  );
}
