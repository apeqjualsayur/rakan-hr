"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import {
  FormFeedback,
  useErrorText,
  useFieldError,
} from "@/components/forms/FormFeedback";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Select } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import { typeName } from "@/lib/credentials/logic";
import type { CredentialType, Requirement } from "@/lib/credentials/types";
import { idle, type FormState } from "@/lib/settings/form";
import { useFormAction } from "@/lib/use-form-action";
import { cn } from "@/lib/utils";
import { saveCredentialType, setRequirement } from "./actions";

export type RoleColumn = { id: string; name: string; is_clinical: boolean };
export type RequirementCell = {
  job_role_id: string;
  credential_type_id: string;
  requirement: Requirement;
  blocks_roster: boolean;
};

// CRD-01 / CRD-02 / CRD-19 catalogue and CRD-03 requirement matrix.
export function CredentialSettings({
  types,
  roles,
  requirements,
  canEdit,
  enforcement,
}: {
  types: readonly CredentialType[];
  roles: readonly RoleColumn[];
  requirements: readonly RequirementCell[];
  canEdit: boolean;
  enforcement: "soft" | "hard";
}) {
  const t = useTranslations("Settings.credentials");
  const locale = useLocale();
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const active = types.filter((x) => x.is_active);

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-col gap-4">
        <CardHeader title={t("matrixTitle")} />
        <p className="-mt-2 max-w-3xl text-meta text-ink-muted">
          {t("matrixIntro")}
        </p>
        <p className="text-meta text-ink-soft">
          {t("enforcement", { mode: t(`enforcementModes.${enforcement}`) })}
        </p>
        {roles.length === 0 ? (
          <p className="text-body text-ink-muted">{t("noRoles")}</p>
        ) : (
          <div className="-mx-5 overflow-x-auto px-5 md:-mx-6 md:px-6">
            <table className="w-full min-w-max border-collapse text-left">
              <thead>
                <tr className="border-b border-border">
                  <th scope="col" className="py-3 pr-4 text-label text-ink" />
                  {roles.map((r) => (
                    <th
                      key={r.id}
                      scope="col"
                      className="min-w-44 px-3 py-3 text-label text-ink"
                    >
                      {r.name}
                      <span className="block text-meta font-normal text-ink-muted">
                        {r.is_clinical ? t("clinical") : t("nonClinical")}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {active.map((type) => (
                  <tr
                    key={type.id}
                    className="border-b border-border last:border-b-0"
                  >
                    <th
                      scope="row"
                      className="py-2 pr-4 text-body font-medium text-ink"
                    >
                      {typeName(type, locale)}
                    </th>
                    {roles.map((role) => (
                      <td key={role.id} className="px-3 py-2 align-top">
                        <RequirementCellEditor
                          roleId={role.id}
                          typeId={type.id}
                          cell={requirements.find(
                            (c) =>
                              c.job_role_id === role.id &&
                              c.credential_type_id === type.id,
                          )}
                          canEdit={canEdit}
                          label={`${role.name}: ${typeName(type, locale)}`}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="flex flex-col gap-4">
        <CardHeader
          title={t("typesTitle")}
          action={
            canEdit && editing !== "new" ? (
              <Button variant="link" onClick={() => setEditing("new")}>
                <Plus aria-hidden />
                {t("add")}
              </Button>
            ) : null
          }
        />
        <p className="-mt-2 max-w-3xl text-meta text-ink-muted">
          {t("typesIntro")}
        </p>
        {editing === "new" ? (
          <TypeForm onDone={() => setEditing(null)} />
        ) : null}
        <ul className="divide-y divide-border">
          {types.map((type) =>
            editing === type.id ? (
              <li key={type.id} className="py-3">
                <TypeForm type={type} onDone={() => setEditing(null)} />
              </li>
            ) : (
              <li
                key={type.id}
                className="flex flex-col gap-2 py-3 md:flex-row md:items-center md:gap-4"
              >
                <div
                  className={cn(
                    "min-w-0 flex-1",
                    !type.is_active && "opacity-60",
                  )}
                >
                  <p className="text-h3 text-ink">{typeName(type, locale)}</p>
                  <p className="text-meta text-ink-muted">
                    {[
                      type.has_expiry
                        ? type.default_validity_months
                          ? t("validFor", {
                              months: type.default_validity_months,
                            })
                          : t("expires")
                        : t("noExpiry"),
                      type.issuing_body,
                      type.tracks_cpd ? t("cpd") : null,
                      type.restricted ? t("restrictedTag") : null,
                      type.is_active ? null : t("notInUse"),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                {canEdit ? (
                  <Button
                    variant="outline"
                    size="row"
                    onClick={() => setEditing(type.id)}
                  >
                    {t("edit")}
                  </Button>
                ) : null}
              </li>
            ),
          )}
        </ul>
      </Card>
    </div>
  );
}

function RequirementCellEditor({
  roleId,
  typeId,
  cell,
  canEdit,
  label,
}: {
  roleId: string;
  typeId: string;
  cell?: RequirementCell;
  canEdit: boolean;
  label: string;
}) {
  const t = useTranslations("Settings.credentials");
  const errorText = useErrorText();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<FormState | null>(null);
  const value = cell?.requirement ?? "none";
  const save = (requirement: "none" | Requirement, blocks: boolean) =>
    startTransition(async () =>
      setResult(await setRequirement(roleId, typeId, requirement, blocks)),
    );

  return (
    <div className="flex flex-col gap-1">
      <Select
        aria-label={label}
        value={value}
        disabled={!canEdit || pending}
        onChange={(e) => {
          const next = e.target.value as "none" | Requirement;
          save(
            next,
            next === "mandatory" ? (cell?.blocks_roster ?? true) : false,
          );
        }}
      >
        <option value="none">{t("none")}</option>
        <option value="mandatory">{t("mandatory")}</option>
        <option value="optional">{t("optional")}</option>
      </Select>
      {value === "mandatory" ? (
        <label className="flex min-h-11 items-center gap-2 text-meta text-ink-soft">
          <input
            type="checkbox"
            className="size-5 accent-primary"
            checked={cell?.blocks_roster ?? false}
            disabled={!canEdit || pending}
            onChange={(e) => save("mandatory", e.target.checked)}
          />
          {t("blocksRoster")}
        </label>
      ) : null}
      {result?.status === "error" ? (
        <p role="alert" className="text-meta text-danger">
          {errorText(result.message ?? "saveFailed")}
        </p>
      ) : null}
    </div>
  );
}

function TypeForm({
  type,
  onDone,
}: {
  type?: CredentialType;
  onDone: () => void;
}) {
  const t = useTranslations("Settings.credentials");
  const { state, onSubmit, pending } = useFormAction(
    async (previous: FormState, data: FormData) => {
      const result = await saveCredentialType(previous, data);
      if (result.status === "saved") onDone();
      return result;
    },
    idle,
  );
  const error = useFieldError(state);
  const [hasExpiry, setHasExpiry] = useState(type?.has_expiry ?? true);
  const [tracksCpd, setTracksCpd] = useState(type?.tracks_cpd ?? false);
  const check = (
    name: string,
    label: string,
    checked: boolean,
    onChange?: (v: boolean) => void,
  ) => (
    <label className="flex min-h-11 items-center gap-3 text-body text-ink">
      <input
        type="checkbox"
        name={name}
        defaultChecked={checked}
        onChange={(e) => onChange?.(e.target.checked)}
        className="size-5 accent-primary"
      />
      {label}
    </label>
  );

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-4 rounded-tile border border-border bg-canvas p-4"
      noValidate
    >
      {type ? <input type="hidden" name="type_id" value={type.id} /> : null}
      <div className="grid gap-4 md:grid-cols-2">
        <TextField
          label={t("name_en")}
          name="name_en"
          defaultValue={type?.name_en ?? ""}
          error={error("name_en")}
        />
        <TextField
          label={t("name_ms")}
          name="name_ms"
          defaultValue={type?.name_ms ?? ""}
          error={error("name_ms")}
        />
        <TextField
          className="md:col-span-2"
          label={t("issuing_body")}
          name="issuing_body"
          defaultValue={type?.issuing_body ?? ""}
          error={error("issuing_body")}
        />
      </div>
      {check("has_expiry", t("has_expiry"), hasExpiry, setHasExpiry)}
      {hasExpiry ? (
        <div className="grid gap-4 md:grid-cols-2">
          <TextField
            label={t("default_validity_months")}
            name="default_validity_months"
            inputMode="numeric"
            defaultValue={type?.default_validity_months ?? ""}
            error={error("default_validity_months")}
          />
          <TextField
            label={t("reminder_offsets_days")}
            name="reminder_offsets_days"
            defaultValue={(type?.reminder_offsets_days ?? [90, 60, 30, 7]).join(
              ", ",
            )}
            hint={t("reminder_offsetsHint")}
            error={
              error("reminder_offsets_days") ? t("invalidOffsets") : undefined
            }
          />
        </div>
      ) : null}
      {check("tracks_cpd", t("tracks_cpd"), tracksCpd, setTracksCpd)}
      {tracksCpd ? (
        <>
          <p className="text-meta text-warning">{t("cpdVerify")}</p>
          <div className="grid gap-4 md:grid-cols-2">
            <TextField
              label={t("cpd_points_required")}
              name="cpd_points_required"
              inputMode="decimal"
              defaultValue={type?.cpd_points_required ?? ""}
              error={error("cpd_points_required")}
            />
            <TextField
              label={t("cpd_cycle_months")}
              name="cpd_cycle_months"
              inputMode="numeric"
              defaultValue={type?.cpd_cycle_months ?? ""}
              error={error("cpd_cycle_months")}
            />
          </div>
        </>
      ) : null}
      {check("restricted", t("restricted"), type?.restricted ?? false)}
      {check("is_active", t("is_active"), type?.is_active ?? true)}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" loading={pending}>
          {t("save")}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          {t("cancel")}
        </Button>
        <FormFeedback state={state} />
      </div>
    </form>
  );
}
