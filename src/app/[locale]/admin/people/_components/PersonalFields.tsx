"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Card, CardHeader } from "@/components/ui/Card";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import { dateFromIso, formatDate, malaysiaToday } from "@/lib/format";
import {
  GENDERS,
  ID_TYPES,
  MALAYSIA,
  MARITAL_STATUSES,
  RELIGIONS,
  type Employee,
} from "@/lib/people/employee";
import { parseMyKad } from "@/lib/people/mykad";
import { revealIdNo } from "../actions";
import { RevealValue } from "./RevealValue";

type Fields = Pick<
  Employee,
  | "id"
  | "full_name"
  | "id_type"
  | "id_no_last4"
  | "nationality"
  | "is_permanent_resident"
  | "date_of_birth"
  | "gender"
  | "marital_status"
  | "religion"
  | "email"
  | "phone"
  | "address"
  | "work_email"
  | "work_phone"
  | "emergency_contact"
>;

// EMP-01 personal details. Typing a MyKad number fills date of birth and gender (EMP-02);
// the server derives them again from the number, so the two always agree.
export function PersonalFields({
  employee,
  error,
  canReveal = false,
  hideWork = false,
}: {
  employee?: Fields | null;
  error: (name: string) => string | undefined;
  canReveal?: boolean;
  /** Pre-boarding portal (Step 8): work email and phone are set by HR later. */
  hideWork?: boolean;
}) {
  const t = useTranslations("People.personal");
  const locale = useLocale();
  const [idType, setIdType] = useState(employee?.id_type ?? "mykad");
  const [dob, setDob] = useState(employee?.date_of_birth ?? "");
  const [gender, setGender] = useState<string>(employee?.gender ?? "");
  const [derived, setDerived] = useState<string | null>(null);
  const [malaysian, setMalaysian] = useState(
    (employee?.nationality ?? MALAYSIA) === MALAYSIA,
  );

  const onIdInput = (value: string) => {
    if (idType !== "mykad") return;
    const ic = parseMyKad(value, malaysiaToday());
    if (!ic.ok) {
      setDerived(null);
      return;
    }
    setDob(ic.value.dateOfBirth);
    setGender(ic.value.gender);
    setDerived(
      t("fromMykad", {
        date: formatDate(dateFromIso(ic.value.dateOfBirth), locale, "full"),
        gender: t(`genders.${ic.value.gender}`),
      }),
    );
  };

  const stored = employee?.id_no_last4;
  const idHint = derived ?? (idType === "mykad" ? t("id_noHint") : undefined);

  return (
    <>
      <Card className="flex flex-col gap-5">
        <CardHeader title={t("title")} />
        <div className="grid gap-5 md:grid-cols-2">
          <TextField
            className="md:col-span-2"
            label={t("full_name")}
            name="full_name"
            defaultValue={employee?.full_name ?? ""}
            error={error("full_name")}
            autoComplete="off"
            required
          />
          <SelectField
            label={t("id_type")}
            name="id_type"
            value={idType}
            onChange={(e) => {
              setIdType(e.target.value as typeof idType);
              setDerived(null);
            }}
            error={error("id_type")}
          >
            {ID_TYPES.map((type) => (
              <option key={type} value={type}>
                {t(`idTypes.${type}`)}
              </option>
            ))}
          </SelectField>
          <div className="flex flex-col gap-2">
            <TextField
              label={idType === "mykad" ? t("id_no") : t("id_noPassport")}
              name="id_no"
              inputMode={idType === "mykad" ? "numeric" : "text"}
              autoComplete="off"
              placeholder={idType === "mykad" ? "880512-14-5432" : undefined}
              onChange={(e) => onIdInput(e.target.value)}
              hint={
                stored && !derived
                  ? t("id_noStored", { masked: `••${stored}` })
                  : idHint
              }
              error={error("id_no")}
            />
            {stored && employee && canReveal ? (
              <RevealValue
                last4={stored}
                reveal={() => revealIdNo(employee.id)}
              />
            ) : null}
          </div>
          <TextField
            type="date"
            label={t("date_of_birth")}
            name="date_of_birth"
            value={dob}
            onChange={(e) => setDob(e.target.value)}
            error={error("date_of_birth")}
          />
          <SelectField
            label={t("gender")}
            name="gender"
            value={gender}
            onChange={(e) => setGender(e.target.value)}
            error={error("gender")}
          >
            <option value="">{t("choose")}</option>
            {GENDERS.map((g) => (
              <option key={g} value={g}>
                {t(`genders.${g}`)}
              </option>
            ))}
          </SelectField>

          <fieldset className="flex flex-col gap-3 md:col-span-2">
            <legend className="mb-2 text-label text-ink">
              {t("nationality")}
            </legend>
            <div className="flex flex-wrap gap-x-6">
              {(["my", "other"] as const).map((kind) => (
                <label
                  key={kind}
                  className="flex min-h-11 cursor-pointer items-center gap-3 text-body text-ink"
                >
                  <input
                    type="radio"
                    name="nationality_kind"
                    value={kind}
                    checked={malaysian === (kind === "my")}
                    onChange={() => setMalaysian(kind === "my")}
                    className="size-5 accent-primary"
                  />
                  {kind === "my" ? t("nationalityMy") : t("nationalityOther")}
                </label>
              ))}
            </div>
            {malaysian ? null : (
              <div className="grid gap-4 md:grid-cols-2">
                <TextField
                  label={t("nationality_other")}
                  name="nationality_other"
                  defaultValue={
                    employee && employee.nationality !== MALAYSIA
                      ? employee.nationality
                      : ""
                  }
                  error={error("nationality_other")}
                />
                <label className="flex min-h-11 cursor-pointer items-center gap-3 self-end text-body text-ink">
                  <input
                    type="checkbox"
                    name="is_pr"
                    defaultChecked={employee?.is_permanent_resident ?? false}
                    className="size-5 accent-primary"
                  />
                  {t("is_pr")}
                </label>
              </div>
            )}
          </fieldset>

          <SelectField
            label={t("marital_status")}
            name="marital_status"
            defaultValue={employee?.marital_status ?? ""}
            error={error("marital_status")}
          >
            <option value="">{t("choose")}</option>
            {MARITAL_STATUSES.map((m) => (
              <option key={m} value={m}>
                {t(`maritalStatuses.${m}`)}
              </option>
            ))}
          </SelectField>
          <SelectField
            label={t("religion")}
            name="religion"
            defaultValue={employee?.religion ?? ""}
            hint={t("religionHint")}
            error={error("religion")}
          >
            <option value="">{t("notStated")}</option>
            {RELIGIONS.map((r) => (
              <option key={r} value={r}>
                {t(`religions.${r}`)}
              </option>
            ))}
          </SelectField>
        </div>
      </Card>

      <Card className="flex flex-col gap-5">
        <CardHeader title={t("contacts")} />
        <div className="grid gap-5 md:grid-cols-2">
          {hideWork ? null : (
            <>
              <TextField
                type="email"
                label={t("work_email")}
                name="work_email"
                defaultValue={employee?.work_email ?? ""}
                hint={t("work_emailHint")}
                error={error("work_email")}
                autoComplete="off"
              />
              <TextField
                type="tel"
                label={t("work_phone")}
                name="work_phone"
                defaultValue={employee?.work_phone ?? ""}
                hint={t("work_phoneHint")}
                error={error("work_phone")}
              />
            </>
          )}
          <TextField
            type="email"
            label={t("email")}
            name="email"
            defaultValue={employee?.email ?? ""}
            error={error("email")}
            autoComplete="off"
          />
          <TextField
            type="tel"
            label={t("phone")}
            name="phone"
            defaultValue={employee?.phone ?? ""}
            error={error("phone")}
          />
          <TextField
            className="md:col-span-2"
            label={t("address")}
            name="address"
            defaultValue={employee?.address ?? ""}
            error={error("address")}
          />
        </div>
        <fieldset className="flex flex-col gap-4">
          <legend className="mb-2 text-label text-ink">{t("emergency")}</legend>
          <div className="grid gap-5 md:grid-cols-3">
            <TextField
              label={t("emergency_name")}
              name="emergency_name"
              defaultValue={employee?.emergency_contact?.name ?? ""}
              error={error("emergency_name")}
            />
            <TextField
              label={t("emergency_relationship")}
              name="emergency_relationship"
              defaultValue={employee?.emergency_contact?.relationship ?? ""}
              error={error("emergency_relationship")}
            />
            <TextField
              type="tel"
              label={t("emergency_phone")}
              name="emergency_phone"
              defaultValue={employee?.emergency_contact?.phone ?? ""}
              error={error("emergency_phone")}
            />
          </div>
        </fieldset>
      </Card>
    </>
  );
}
