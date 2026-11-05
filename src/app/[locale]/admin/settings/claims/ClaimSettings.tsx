"use client";

import { useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  FormFeedback,
  ReadOnlyNote,
  useFieldError,
} from "@/components/forms/FormFeedback";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/Card";
import { TextField } from "@/components/ui/TextField";
import {
  saveClaimType,
  saveMileageRate,
  setClaimTypeActive,
} from "@/lib/claims/actions";
import type { ClaimType } from "@/lib/claims/types";
import { formatMoney } from "@/lib/format";
import { idle } from "@/lib/settings/form";
import { useFormAction } from "@/lib/use-form-action";

type Role = { id: string; name: string };

export function ClaimSettings({
  types,
  roles,
  mileageRate,
  canEdit,
  canEditRate,
}: {
  types: readonly ClaimType[];
  roles: readonly Role[];
  mileageRate: string | null;
  canEdit: boolean;
  canEditRate: boolean;
}) {
  const t = useTranslations("Claims.settings");
  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-3xl text-body text-ink-muted">{t("intro")}</p>
      {canEdit ? null : <ReadOnlyNote who="ownerHr" />}
      <MileageRate rate={mileageRate} canEdit={canEditRate} />
      {types.map((type) => (
        <TypeCard key={type.id} type={type} roles={roles} canEdit={canEdit} />
      ))}
      {canEdit ? (
        <Card className="flex flex-col gap-4">
          <CardHeader title={t("newType")} as="h3" />
          <TypeForm roles={roles} canEdit />
        </Card>
      ) : null}
    </div>
  );
}

function MileageRate({
  rate,
  canEdit,
}: {
  rate: string | null;
  canEdit: boolean;
}) {
  const t = useTranslations("Claims.settings");
  const { state, onSubmit, pending } = useFormAction(saveMileageRate, idle);
  const error = useFieldError(state);
  return (
    <Card className="flex flex-col gap-3">
      <CardHeader title={t("mileageTitle")} />
      <p className="-mt-1 text-meta text-ink-muted">
        {rate
          ? t("mileageNow", { rate: formatMoney(rate) })
          : t("mileageUnset")}
      </p>
      {canEdit ? (
        <form
          onSubmit={onSubmit}
          className="flex flex-wrap items-end gap-3"
          noValidate
        >
          <TextField
            label={t("mileageRate")}
            name="mileage_rate_per_km"
            inputMode="decimal"
            defaultValue={rate ?? ""}
            hint={t("mileageHint")}
            error={error("mileage_rate_per_km")}
            className="w-48"
          />
          <Button type="submit" variant="outline" size="row" loading={pending}>
            {t("saveRate")}
          </Button>
          <FormFeedback state={state} />
        </form>
      ) : (
        <p className="text-meta text-ink-muted">{t("mileageOwner")}</p>
      )}
    </Card>
  );
}

function TypeCard({
  type,
  roles,
  canEdit,
}: {
  type: ClaimType;
  roles: readonly Role[];
  canEdit: boolean;
}) {
  const t = useTranslations("Claims.settings");
  const locale = useLocale();
  const [pending, startTransition] = useTransition();
  const who = type.eligible_role_ids.length
    ? roles
        .filter((r) => type.eligible_role_ids.includes(r.id))
        .map((r) => r.name)
        .join(", ")
    : t("everyone");
  const tags = [
    type.monthly_limit
      ? t("tags.monthly", { amount: formatMoney(type.monthly_limit) })
      : t("tags.noMonthly"),
    type.per_claim_limit
      ? t("tags.perClaim", { amount: formatMoney(type.per_claim_limit) })
      : null,
    type.is_taxable ? t("tags.taxable") : t("tags.nonTaxable"),
    type.requires_receipt ? t("tags.receipt") : null,
    type.is_mileage ? t("tags.mileage") : null,
    who,
  ].filter(Boolean);
  return (
    <Card className="flex flex-col gap-4">
      <CardHeader
        title={locale === "ms" ? type.name_ms : type.name_en}
        action={
          canEdit ? (
            <Button
              type="button"
              variant="ghost"
              size="row"
              loading={pending}
              onClick={() =>
                startTransition(
                  async () =>
                    void (await setClaimTypeActive(type.id, !type.is_active)),
                )
              }
            >
              {type.is_active ? t("switchOff") : t("switchOn")}
            </Button>
          ) : null
        }
      />
      <p className="-mt-2 text-meta text-ink-muted">
        {tags.join(" · ")}
        {type.is_active ? "" : ` · ${t("off")}`}
      </p>
      {canEdit ? (
        <details className="text-meta">
          <summary className="min-h-11 cursor-pointer py-2 text-label text-primary">
            {t("edit")}
          </summary>
          <div className="mt-2">
            <TypeForm type={type} roles={roles} canEdit />
          </div>
        </details>
      ) : null}
    </Card>
  );
}

function TypeForm({
  type,
  roles,
  canEdit,
}: {
  type?: ClaimType;
  roles: readonly Role[];
  canEdit: boolean;
}) {
  const t = useTranslations("Claims.settings");
  const { state, onSubmit, pending } = useFormAction(saveClaimType, idle);
  const error = useFieldError(state);
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      {type ? (
        <input type="hidden" name="claim_type_id" value={type.id} />
      ) : null}
      <fieldset disabled={!canEdit} className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            label={t("nameEn")}
            name="name_en"
            defaultValue={type?.name_en}
            error={error("name_en")}
          />
          <TextField
            label={t("nameMs")}
            name="name_ms"
            defaultValue={type?.name_ms}
            error={error("name_ms")}
          />
          <TextField
            label={t("monthlyLimit")}
            name="monthly_limit"
            inputMode="decimal"
            defaultValue={type?.monthly_limit ?? ""}
            hint={t("blankNoLimit")}
            error={error("monthly_limit")}
          />
          <TextField
            label={t("perClaimLimit")}
            name="per_claim_limit"
            inputMode="decimal"
            defaultValue={type?.per_claim_limit ?? ""}
            hint={t("blankNoLimit")}
            error={error("per_claim_limit")}
          />
        </div>
        <label className="flex items-center gap-2 text-body text-ink">
          <input
            type="checkbox"
            name="is_taxable"
            defaultChecked={type?.is_taxable ?? false}
            className="size-5 accent-primary"
          />
          {t("taxable")}
        </label>
        <label className="flex items-center gap-2 text-body text-ink">
          <input
            type="checkbox"
            name="requires_receipt"
            defaultChecked={type?.requires_receipt ?? true}
            className="size-5 accent-primary"
          />
          {t("requiresReceipt")}
        </label>
        {roles.length ? (
          <fieldset className="flex flex-col gap-2">
            <legend className="text-label text-ink">{t("whoCanClaim")}</legend>
            <p className="text-meta text-ink-muted">{t("whoHint")}</p>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {roles.map((r) => (
                <label
                  key={r.id}
                  className="flex min-h-11 items-center gap-2 text-body text-ink"
                >
                  <input
                    type="checkbox"
                    name="eligible_role_ids"
                    value={r.id}
                    defaultChecked={
                      type?.eligible_role_ids.includes(r.id) ?? false
                    }
                    className="size-5 accent-primary"
                  />
                  {r.name}
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}
      </fieldset>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" variant="outline" size="row" loading={pending}>
          {type ? t("save") : t("add")}
        </Button>
        <FormFeedback state={state} />
      </div>
    </form>
  );
}
