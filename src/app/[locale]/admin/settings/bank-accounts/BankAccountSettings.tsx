"use client";

import { useState, useTransition } from "react";
import { Landmark } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import {
  FormFeedback,
  ReadOnlyNote,
  useErrorText,
  useFieldError,
} from "@/components/forms/FormFeedback";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { MaskedValue } from "@/components/ui/MaskedValue";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import { dateFromIso, formatDate } from "@/lib/format";
import {
  delimiterChoice,
  DELIMITER_CHOICES,
  formatsFor,
  type BankFileFormat,
  type CompanyBankAccount,
} from "@/lib/payments/accounts";
import {
  addCompanyAccount,
  retireAccount,
  saveAccountDetails,
  saveColumnMapping,
  setDefaultAccount,
} from "@/lib/payments/actions";
import {
  DATE_FORMATS,
  DEFAULT_GENERIC_MAPPING,
  GENERIC_FIELDS,
  parseGenericMapping,
} from "@/lib/payments/bank-files";
import { bankName, type Bank } from "@/lib/people/records";
import { idle, type FormState } from "@/lib/settings/form";
import { useFormAction } from "@/lib/use-form-action";

export function BankAccountSettings({
  accounts,
  banks,
  formats,
  canEdit,
}: {
  accounts: readonly CompanyBankAccount[];
  banks: readonly Bank[];
  formats: readonly BankFileFormat[];
  canEdit: boolean;
}) {
  const t = useTranslations("BankAccounts");
  const active = accounts.filter((a) => !a.retired_at);
  const retired = accounts.filter((a) => a.retired_at);
  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-3xl text-body text-ink-muted">{t("intro")}</p>
      {canEdit ? null : <ReadOnlyNote who="owner" />}
      {active.length > 0 && !active.some((a) => a.is_default) ? (
        <p
          role="status"
          className="rounded-tile bg-warning-tint px-4 py-3 text-meta text-warning"
        >
          {t("noDefault")}
        </p>
      ) : null}
      {active.length === 0 ? (
        <Card>
          <EmptyState message={t("none")} />
        </Card>
      ) : (
        active.map((a) => (
          <AccountCard
            key={a.id}
            account={a}
            banks={banks}
            formats={formats}
            canEdit={canEdit}
          />
        ))
      )}
      {canEdit ? <NewAccount banks={banks} formats={formats} /> : null}
      {retired.length ? <RetiredList accounts={retired} banks={banks} /> : null}
    </div>
  );
}

function AccountCard({
  account,
  banks,
  formats,
  canEdit,
}: {
  account: CompanyBankAccount;
  banks: readonly Bank[];
  formats: readonly BankFileFormat[];
  canEdit: boolean;
}) {
  const t = useTranslations("BankAccounts");
  const locale = useLocale();
  const errorText = useErrorText();
  const [result, setResult] = useState<FormState | null>(null);
  const [pending, startTransition] = useTransition();
  const format = formats.find((f) => f.code === account.bank_file_format_code);
  const run = (action: () => Promise<FormState>) =>
    startTransition(async () => setResult(await action()));
  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start gap-4">
        <span
          aria-hidden
          className="grid size-12 shrink-0 place-items-center rounded-control bg-primary-tint text-primary"
        >
          <Landmark size={24} strokeWidth={1.75} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="flex flex-wrap items-center gap-2 text-h3 text-ink">
            <MaskedValue
              prefix={bankName(banks, account.bank_code)}
              value={account.account_no_last4}
            />
            {account.is_default ? (
              <span className="rounded-full bg-primary-tint px-3 py-0.5 text-label text-primary">
                {t("default")}
              </span>
            ) : null}
          </p>
          <p className="text-meta text-ink-muted">
            {[
              account.account_name,
              t("fileFormat", {
                name: format?.name ?? account.bank_file_format_code,
              }),
              account.corporate_id
                ? t("corporateIdIs", { id: account.corporate_id })
                : null,
              account.org_code
                ? t("orgCodeIs", { code: account.org_code })
                : null,
              t("since", {
                date: formatDate(
                  dateFromIso(account.active_from),
                  locale,
                  "full",
                ),
              }),
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        {canEdit ? (
          <div className="flex flex-wrap gap-2">
            {account.is_default ? null : (
              <Button
                type="button"
                variant="outline"
                size="row"
                disabled={pending}
                onClick={() => run(() => setDefaultAccount(account.id))}
              >
                {t("setDefault")}
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="row"
              disabled={pending}
              onClick={() => {
                if (
                  window.confirm(
                    account.is_default
                      ? t("retireDefaultConfirm")
                      : t("retireConfirm"),
                  )
                )
                  run(() => retireAccount(account.id));
              }}
            >
              {t("retire")}
            </Button>
          </div>
        ) : null}
      </div>
      {result?.status === "error" ? (
        <p role="alert" className="text-meta font-medium text-danger">
          {errorText(result.message ?? "saveFailed")}
        </p>
      ) : null}
      {canEdit ? (
        <>
          <details className="text-meta">
            <summary className="min-h-11 cursor-pointer py-2 text-label text-primary">
              {t("editDetails")}
            </summary>
            <DetailsForm account={account} formats={formats} />
          </details>
          {format?.bank_code === null ? (
            <details className="text-meta">
              <summary className="min-h-11 cursor-pointer py-2 text-label text-primary">
                {t("columns.title")}
              </summary>
              <MappingForm account={account} format={format} />
            </details>
          ) : null}
        </>
      ) : null}
    </Card>
  );
}

function FormatSelect({
  formats,
  bankCode,
  defaultValue,
  error,
}: {
  formats: readonly BankFileFormat[];
  bankCode: string;
  defaultValue?: string;
  error?: string;
}) {
  const t = useTranslations("BankAccounts");
  const options = formatsFor(formats, bankCode);
  return (
    <SelectField
      label={t("format")}
      name="bank_file_format_code"
      defaultValue={
        defaultValue ?? options.find((f) => f.bank_code)?.code ?? "GENERIC_CSV"
      }
      key={bankCode}
      hint={t("formatHint")}
      error={error}
    >
      {options.map((f) => (
        <option key={f.code} value={f.code}>
          {f.name}
        </option>
      ))}
    </SelectField>
  );
}

function DetailsForm({
  account,
  formats,
}: {
  account: CompanyBankAccount;
  formats: readonly BankFileFormat[];
}) {
  const t = useTranslations("BankAccounts");
  const { state, onSubmit, pending } = useFormAction(saveAccountDetails, idle);
  const error = useFieldError(state);
  return (
    <form onSubmit={onSubmit} className="mt-2 flex flex-col gap-4" noValidate>
      <input type="hidden" name="account_id" value={account.id} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label={t("accountName")}
          name="account_name"
          defaultValue={account.account_name}
          error={error("account_name")}
        />
        <FormatSelect
          formats={formats}
          bankCode={account.bank_code}
          defaultValue={account.bank_file_format_code}
          error={error("bank_file_format_code")}
        />
        <TextField
          label={t("corporateId")}
          name="corporate_id"
          defaultValue={account.corporate_id ?? ""}
          hint={t("bankIdHint")}
          error={error("corporate_id")}
        />
        <TextField
          label={t("orgCode")}
          name="org_code"
          defaultValue={account.org_code ?? ""}
          hint={t("bankIdHint")}
          error={error("org_code")}
        />
      </div>
      <p className="text-meta text-ink-muted">{t("numberFixed")}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" variant="outline" size="row" loading={pending}>
          {t("saveDetails")}
        </Button>
        <FormFeedback state={state} />
      </div>
    </form>
  );
}

function MappingForm({
  account,
  format,
}: {
  account: CompanyBankAccount;
  format: BankFileFormat;
}) {
  const t = useTranslations("BankAccounts.columns");
  const { state, onSubmit, pending } = useFormAction(saveColumnMapping, idle);
  const reset = useFormAction(saveColumnMapping, idle);
  const error = useFieldError(state);
  const own = parseGenericMapping(account.column_mapping);
  const mapping =
    own ??
    parseGenericMapping(format.column_mapping) ??
    DEFAULT_GENERIC_MAPPING;
  const position = (field: string) =>
    mapping.columns.findIndex((c) => c.field === field);
  return (
    <div className="mt-2 flex flex-col gap-4">
      <p className="text-meta text-ink-muted">
        {own ? t("ownIntro") : t("defaultIntro")}
      </p>
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <input type="hidden" name="account_id" value={account.id} />
        <div className="grid gap-4 sm:grid-cols-3">
          <SelectField
            label={t("delimiter")}
            name="delimiter"
            defaultValue={delimiterChoice(mapping.delimiter)}
            error={error("delimiter")}
          >
            {Object.keys(DELIMITER_CHOICES).map((d) => (
              <option key={d} value={d}>
                {t(`delimiters.${d as "comma"}`)}
              </option>
            ))}
          </SelectField>
          <SelectField
            label={t("dateFormat")}
            name="date_format"
            defaultValue={mapping.dateFormat}
            error={error("date_format")}
          >
            {DATE_FORMATS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </SelectField>
          <label className="flex min-h-11 items-center gap-2 self-end text-body text-ink">
            <input
              type="checkbox"
              name="header"
              defaultChecked={mapping.header}
              className="size-5 accent-primary"
            />
            {t("headerRow")}
          </label>
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-label text-ink">{t("fields")}</legend>
          {GENERIC_FIELDS.map((field) => {
            const at = position(field);
            return (
              <div
                key={field}
                className="grid grid-cols-[auto_1fr] items-center gap-3 rounded-tile border border-border p-3 sm:grid-cols-[auto_12rem_1fr_6rem]"
              >
                <input
                  type="checkbox"
                  name={`include_${field}`}
                  defaultChecked={at >= 0}
                  aria-label={t("include", { field: t(`field.${field}`) })}
                  className="size-5 accent-primary"
                />
                <span className="text-body text-ink">
                  {t(`field.${field}`)}
                </span>
                <TextField
                  label={t("header")}
                  name={`header_${field}`}
                  defaultValue={
                    at >= 0 ? mapping.columns[at]!.header : t(`field.${field}`)
                  }
                  error={error(`header_${field}`)}
                  className="col-span-2 sm:col-span-1"
                />
                <TextField
                  label={t("order")}
                  name={`order_${field}`}
                  inputMode="numeric"
                  defaultValue={at >= 0 ? at + 1 : ""}
                  error={error(`order_${field}`)}
                  className="col-span-2 sm:col-span-1"
                />
              </div>
            );
          })}
          {error("columns") ? (
            <p className="text-meta font-medium text-danger">
              {error("columns")}
            </p>
          ) : null}
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label={t("sameBank")}
            name="transfer_same"
            defaultValue={mapping.transferTypes?.sameBank ?? ""}
            hint={t("transferHint")}
            error={error("transfer_same")}
          />
          <TextField
            label={t("interbank")}
            name="transfer_inter"
            defaultValue={mapping.transferTypes?.interbank ?? ""}
            hint={t("transferHint")}
            error={error("transfer_inter")}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" variant="outline" size="row" loading={pending}>
            {t("save")}
          </Button>
          <FormFeedback state={state} />
        </div>
      </form>
      {own ? (
        <form onSubmit={reset.onSubmit} className="flex items-center gap-2">
          <input type="hidden" name="account_id" value={account.id} />
          <input type="hidden" name="reset" value="true" />
          <Button
            type="submit"
            variant="ghost"
            size="row"
            loading={reset.pending}
          >
            {t("reset")}
          </Button>
          <FormFeedback state={reset.state} />
        </form>
      ) : null}
    </div>
  );
}

function NewAccount({
  banks,
  formats,
}: {
  banks: readonly Bank[];
  formats: readonly BankFileFormat[];
}) {
  const t = useTranslations("BankAccounts");
  const { state, onSubmit, pending } = useFormAction(addCompanyAccount, idle);
  const error = useFieldError(state);
  // A saved account appears above; a new key gives empty fields, so its number never
  // stays on screen and a second add starts clean.
  const savedAt = state.status === "saved" ? state.at : null;
  return (
    <Card className="flex flex-col gap-4">
      <CardHeader title={t("add")} as="h3" />
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <NewAccountFields
          key={savedAt ?? "new"}
          banks={banks}
          formats={formats}
          error={error}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" variant="accent" loading={pending}>
            {t("addButton")}
          </Button>
          <FormFeedback state={state} />
        </div>
      </form>
    </Card>
  );
}

function NewAccountFields({
  banks,
  formats,
  error,
}: {
  banks: readonly Bank[];
  formats: readonly BankFileFormat[];
  error: (name: string) => string | undefined;
}) {
  const t = useTranslations("BankAccounts");
  const [bank, setBank] = useState("");
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label={t("bank")}
          name="bank_code"
          value={bank}
          onChange={(e) => setBank(e.target.value)}
          error={error("bank_code")}
        >
          <option value="">{t("chooseBank")}</option>
          {banks.map((b) => (
            <option key={b.code} value={b.code}>
              {b.name}
            </option>
          ))}
        </SelectField>
        <TextField
          label={t("accountName")}
          name="account_name"
          hint={t("accountNameHint")}
          error={error("account_name")}
        />
        <TextField
          label={t("accountNo")}
          name="account_no"
          inputMode="numeric"
          autoComplete="off"
          error={error("account_no")}
        />
        <TextField
          label={t("accountNoConfirm")}
          name="account_no_confirm"
          inputMode="numeric"
          autoComplete="off"
          hint={t("numberFixed")}
          error={error("account_no_confirm")}
        />
        {bank ? (
          <FormatSelect
            formats={formats}
            bankCode={bank}
            error={error("bank_file_format_code")}
          />
        ) : null}
        <TextField
          label={t("corporateId")}
          name="corporate_id"
          hint={t("bankIdHint")}
          error={error("corporate_id")}
        />
        <TextField
          label={t("orgCode")}
          name="org_code"
          hint={t("bankIdHint")}
          error={error("org_code")}
        />
      </div>
      <label className="flex min-h-11 items-center gap-2 text-body text-ink">
        <input
          type="checkbox"
          name="is_default"
          className="size-5 accent-primary"
        />
        {t("makeDefault")}
      </label>
    </>
  );
}

function RetiredList({
  accounts,
  banks,
}: {
  accounts: readonly CompanyBankAccount[];
  banks: readonly Bank[];
}) {
  const t = useTranslations("BankAccounts");
  const locale = useLocale();
  return (
    <Card className="flex flex-col gap-2">
      <CardHeader title={t("retired")} as="h3" />
      <p className="-mt-2 text-meta text-ink-muted">{t("retiredIntro")}</p>
      <ul className="flex flex-col divide-y divide-border">
        {accounts.map((a) => (
          <li key={a.id} className="flex flex-wrap items-center gap-3 py-3">
            <span className="min-w-0 flex-1 text-body text-ink">
              <MaskedValue
                prefix={bankName(banks, a.bank_code)}
                value={a.account_no_last4}
              />
              <span className="text-ink-muted"> · {a.account_name}</span>
            </span>
            <span className="text-meta text-ink-muted">
              {t("retiredOn", {
                date: formatDate(new Date(a.retired_at!), locale, "full"),
              })}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
