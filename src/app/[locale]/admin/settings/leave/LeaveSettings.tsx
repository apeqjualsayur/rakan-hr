"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
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
  deletePolicy,
  saveLeaveType,
  savePolicy,
  setLeaveTypeActive,
} from "@/lib/leave/actions";
import { days as fmt, floorFor } from "@/lib/leave/logic";
import type {
  LeavePolicy,
  LeaveType,
  StatutoryMinimum,
} from "@/lib/leave/types";
import { idle } from "@/lib/settings/form";
import { useFormAction } from "@/lib/use-form-action";

export function LeaveSettings({
  types,
  policies,
  minimums,
  canEdit,
}: {
  types: readonly LeaveType[];
  policies: readonly LeavePolicy[];
  minimums: readonly StatutoryMinimum[];
  canEdit: boolean;
}) {
  const t = useTranslations("Leave.settings");
  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-3xl text-body text-ink-muted">{t("intro")}</p>
      {canEdit ? null : <ReadOnlyNote who="ownerHr" />}
      {types.map((type) => (
        <TypeCard
          key={type.id}
          type={type}
          policies={policies.filter((p) => p.leave_type_id === type.id)}
          minimums={minimums}
          canEdit={canEdit}
        />
      ))}
      {canEdit ? <NewType /> : null}
    </div>
  );
}

function TypeCard({
  type,
  policies,
  minimums,
  canEdit,
}: {
  type: LeaveType;
  policies: readonly LeavePolicy[];
  minimums: readonly StatutoryMinimum[];
  canEdit: boolean;
}) {
  const t = useTranslations("Leave.settings");
  const locale = useLocale();
  const [pending, startTransition] = useTransition();
  const tags = [
    type.is_statutory ? t("tags.statutory") : t("tags.company"),
    type.is_paid ? t("tags.paid") : t("tags.unpaid"),
    type.requires_attachment ? t("tags.certificate") : null,
    type.counts_calendar_days ? t("tags.calendarDays") : null,
    type.prorate ? t("tags.prorated") : null,
    type.gender ? t(`tags.${type.gender}`) : null,
  ].filter(Boolean);
  return (
    <Card className="flex flex-col gap-4">
      <CardHeader
        title={locale === "ms" ? type.name_ms : type.name_en}
        action={
          !type.is_statutory && canEdit ? (
            <Button
              type="button"
              variant="ghost"
              size="row"
              loading={pending}
              onClick={() =>
                startTransition(
                  async () =>
                    void (await setLeaveTypeActive(type.id, !type.is_active)),
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
      {type.unlimited ? (
        <p className="text-meta text-ink-muted">{t("unlimited")}</p>
      ) : type.code === "REPLACEMENT" ? (
        <p className="text-meta text-ink-muted">{t("replacement")}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {policies.length === 0 ? (
            <p className="text-meta text-ink-muted">{t("noBands")}</p>
          ) : null}
          {policies.map((p) => (
            <BandForm
              key={p.id}
              type={type}
              policy={p}
              minimums={minimums}
              canEdit={canEdit}
            />
          ))}
          {canEdit ? (
            <BandForm type={type} minimums={minimums} canEdit />
          ) : null}
        </div>
      )}
      {canEdit ? <NamesForm type={type} /> : null}
    </Card>
  );
}

function BandForm({
  type,
  policy,
  minimums,
  canEdit,
}: {
  type: LeaveType;
  policy?: LeavePolicy;
  minimums: readonly StatutoryMinimum[];
  canEdit: boolean;
}) {
  const t = useTranslations("Leave.settings");
  const { state, onSubmit, pending } = useFormAction(savePolicy, idle);
  const error = useFieldError(state);
  const [removing, startRemove] = useTransition();
  const [min, setMin] = useState(String(policy?.min_service_months ?? ""));
  const [max, setMax] = useState(
    policy?.max_service_months === null
      ? ""
      : String(policy?.max_service_months ?? ""),
  );
  const floor = type.is_statutory
    ? floorFor(
        type.code,
        Number(min || 0),
        max === "" ? null : Number(max),
        minimums,
      )
    : null;
  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-3 rounded-tile border border-border p-4"
      noValidate
    >
      <input type="hidden" name="leave_type_id" value={type.id} />
      {policy ? (
        <input type="hidden" name="policy_id" value={policy.id} />
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-label text-ink">
          {policy
            ? policy.max_service_months === null
              ? t("bandFrom", { min: policy.min_service_months })
              : policy.min_service_months === 0
                ? t("bandUnder", { max: policy.max_service_months })
                : t("bandRange", {
                    min: policy.min_service_months,
                    max: policy.max_service_months,
                  })
            : t("newBand")}
        </p>
        {floor !== null ? (
          <p className="text-meta text-ink-muted">
            {t("floor", { days: fmt(floor) })}
          </p>
        ) : null}
      </div>
      <fieldset
        disabled={!canEdit}
        className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5"
      >
        <TextField
          label={t("min")}
          name="min_service_months"
          inputMode="numeric"
          value={min}
          onChange={(e) => setMin(e.target.value)}
          error={error("min_service_months")}
        />
        <TextField
          label={t("max")}
          name="max_service_months"
          inputMode="numeric"
          value={max}
          onChange={(e) => setMax(e.target.value)}
          hint={t("maxHint")}
          error={error("max_service_months")}
        />
        <TextField
          label={t("daysPerYear")}
          name="days_per_year"
          inputMode="decimal"
          defaultValue={policy ? fmt(policy.days_per_year) : ""}
          error={error("days_per_year")}
        />
        <TextField
          label={t("carryMax")}
          name="carry_forward_max"
          inputMode="decimal"
          defaultValue={policy ? fmt(policy.carry_forward_max) : "0"}
          error={error("carry_forward_max")}
        />
        <TextField
          label={t("carryExpiry")}
          name="carry_forward_expiry_months"
          inputMode="numeric"
          defaultValue={policy?.carry_forward_expiry_months ?? ""}
          error={error("carry_forward_expiry_months")}
        />
      </fieldset>
      {canEdit ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" variant="outline" size="row" loading={pending}>
            {policy ? t("saveBand") : t("addBand")}
          </Button>
          {policy && !type.is_statutory ? (
            <Button
              type="button"
              variant="ghost"
              size="row"
              loading={removing}
              onClick={() =>
                startRemove(async () => void (await deletePolicy(policy.id)))
              }
            >
              <Trash2 aria-hidden />
              {t("removeBand")}
            </Button>
          ) : null}
          <FormFeedback state={state} />
        </div>
      ) : null}
    </form>
  );
}

function NamesForm({ type }: { type: LeaveType }) {
  const t = useTranslations("Leave.settings");
  const { state, onSubmit, pending } = useFormAction(saveLeaveType, idle);
  const error = useFieldError(state);
  return (
    <details className="text-meta">
      <summary className="min-h-11 cursor-pointer py-2 text-label text-primary">
        {t("editNames")}
      </summary>
      <form onSubmit={onSubmit} className="mt-2 flex flex-col gap-3" noValidate>
        <input type="hidden" name="leave_type_id" value={type.id} />
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            label={t("nameEn")}
            name="name_en"
            defaultValue={type.name_en}
            error={error("name_en")}
          />
          <TextField
            label={t("nameMs")}
            name="name_ms"
            defaultValue={type.name_ms}
            error={error("name_ms")}
          />
        </div>
        <label className="flex items-center gap-2 text-body text-ink">
          <input
            type="checkbox"
            name="requires_attachment"
            defaultChecked={type.requires_attachment}
            className="size-5 accent-primary"
          />
          {t("needsCertificate")}
        </label>
        {type.is_paid ? (
          <input type="hidden" name="is_paid" value="on" />
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" variant="outline" size="row" loading={pending}>
            {t("saveNames")}
          </Button>
          <FormFeedback state={state} />
        </div>
      </form>
    </details>
  );
}

function NewType() {
  const t = useTranslations("Leave.settings");
  const { state, onSubmit, pending } = useFormAction(saveLeaveType, idle);
  const error = useFieldError(state);
  return (
    <Card className="flex flex-col gap-4">
      <CardHeader title={t("newType")} as="h3" />
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label={t("nameEn")}
            name="name_en"
            error={error("name_en")}
          />
          <TextField
            label={t("nameMs")}
            name="name_ms"
            error={error("name_ms")}
          />
        </div>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-body text-ink">
            <input
              type="checkbox"
              name="is_paid"
              defaultChecked
              className="size-5 accent-primary"
            />
            {t("paid")}
          </label>
          <label className="flex items-center gap-2 text-body text-ink">
            <input
              type="checkbox"
              name="requires_attachment"
              className="size-5 accent-primary"
            />
            {t("needsCertificate")}
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" variant="accent" loading={pending}>
            {t("addType")}
          </Button>
          <FormFeedback state={state} />
        </div>
      </form>
    </Card>
  );
}
