"use client";

import { useTransition } from "react";
import { CheckCircle2, Trash2, Upload } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { PersonalFields } from "@/app/[locale]/admin/people/_components/PersonalFields";
import { FormFeedback, useFieldError } from "@/components/forms/FormFeedback";
import { BankAccountFields } from "@/components/people/BankAccountFields";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/Card";
import { SelectField } from "@/components/ui/SelectField";
import { StatusChip } from "@/components/ui/StatusChip";
import { TextField } from "@/components/ui/TextField";
import { Link } from "@/i18n/navigation";
import { typeName } from "@/lib/credentials/logic";
import { dateFromIso, formatDate } from "@/lib/format";
import {
  addDependent,
  finishPreboarding,
  removeDependent,
  saveBank,
  savePersonal,
  saveStatutory,
  withdrawPreboardingCredential,
} from "@/lib/hiring/preboarding-actions";
import type { PreboardingContext } from "@/lib/hiring/types";
import { PCB_CATEGORIES, type Employee } from "@/lib/people/employee";
import { RELATIONSHIPS } from "@/lib/people/records";
import { idle } from "@/lib/settings/form";
import { useFormAction } from "@/lib/use-form-action";
import { cn } from "@/lib/utils";

type Ctx = PreboardingContext;

function StepHeader({ title, done }: { title: string; done: boolean }) {
  const t = useTranslations("Preboarding");
  return (
    <CardHeader
      title={title}
      action={
        done ? (
          <span className="inline-flex items-center gap-1 text-meta font-medium text-primary">
            <CheckCircle2 aria-hidden size={18} strokeWidth={1.75} />
            {t("stepDone")}
          </span>
        ) : (
          <span className="text-meta text-ink-muted">{t("stepTodo")}</span>
        )
      }
    />
  );
}

/** Personal details and emergency contact (EMP-01 fields, without work contacts). */
export function PersonalSection({ ctx, done }: { ctx: Ctx; done: boolean }) {
  const t = useTranslations("Preboarding");
  const { state, onSubmit, pending } = useFormAction(savePersonal, idle);
  const error = useFieldError(state);
  const e = ctx.employee!;
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <StepHeader title={t("steps.personal")} done={done} />
      <p className="text-meta text-ink-muted">{t("personalIntro")}</p>
      <PersonalFields
        employee={
          { ...e, work_email: null, work_phone: null } as unknown as Employee
        }
        error={error}
        hideWork
      />
      <div className="flex flex-col items-start gap-3">
        <Button type="submit" loading={pending}>
          {t("save")}
        </Button>
        <FormFeedback state={state} />
      </div>
    </form>
  );
}

/** Statutory numbers and PCB category (EMP-04). */
export function StatutorySection({ ctx, done }: { ctx: Ctx; done: boolean }) {
  const t = useTranslations("Preboarding");
  const ts = useTranslations("People.statutory");
  const { state, onSubmit, pending } = useFormAction(saveStatutory, idle);
  const error = useFieldError(state);
  const e = ctx.employee!;
  return (
    <Card className="flex flex-col gap-5">
      <StepHeader title={t("steps.statutory")} done={done} />
      <p className="-mt-2 text-meta text-ink-muted">{t("statutoryIntro")}</p>
      <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
        <div className="grid gap-5 md:grid-cols-3">
          <TextField
            label={ts("epf_no")}
            name="epf_no"
            defaultValue={e.epf_no ?? ""}
            error={error("epf_no")}
          />
          <TextField
            label={ts("socso_no")}
            name="socso_no"
            defaultValue={e.socso_no ?? ""}
            hint={ts("socso_noHint")}
            error={error("socso_no")}
          />
          <TextField
            label={ts("tax_no")}
            name="tax_no"
            defaultValue={e.tax_no ?? ""}
            error={error("tax_no")}
          />
          <SelectField
            className="md:col-span-2"
            label={ts("pcb_category")}
            name="pcb_category"
            defaultValue={e.pcb_category ?? ""}
            error={error("pcb_category")}
          >
            <option value="">{t("choose")}</option>
            {PCB_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {ts(`pcbCategories.${c}`)}
              </option>
            ))}
          </SelectField>
          <TextField
            label={ts("children_count_eligible")}
            name="children_count_eligible"
            inputMode="numeric"
            defaultValue={String(e.children_count_eligible ?? 0)}
            error={error("children_count_eligible")}
          />
        </div>
        <div className="flex flex-col items-start gap-3">
          <Button type="submit" loading={pending}>
            {t("save")}
          </Button>
          <FormFeedback state={state} />
        </div>
      </form>
    </Card>
  );
}

/** Salary account (EMP-05). */
export function BankSection({ ctx, done }: { ctx: Ctx; done: boolean }) {
  const t = useTranslations("Preboarding");
  const { state, onSubmit, pending } = useFormAction(saveBank, idle);
  const error = useFieldError(state);
  const bank = ctx.bank;
  return (
    <Card className="flex flex-col gap-5">
      <StepHeader title={t("steps.bank")} done={done} />
      {bank ? (
        <p className="-mt-2 text-body text-ink">
          {t("bankSaved", {
            bank:
              ctx.banks.find((b) => b.code === bank.bank_code)?.name ??
              bank.bank_code,
            last4: bank.account_no_last4,
            holder: bank.holder_name,
          })}
        </p>
      ) : (
        <p className="-mt-2 text-meta text-ink-muted">{t("bankIntro")}</p>
      )}
      <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
        <BankAccountFields banks={ctx.banks} error={error} />
        <div className="flex flex-col items-start gap-3">
          <Button type="submit" loading={pending}>
            {bank ? t("replaceBank") : t("save")}
          </Button>
          <FormFeedback state={state} />
        </div>
      </form>
    </Card>
  );
}

/** Spouse and children (PCB reliefs). Optional. */
export function DependentsSection({ ctx }: { ctx: Ctx }) {
  const t = useTranslations("Preboarding");
  const td = useTranslations("People.dependents");
  const locale = useLocale();
  const { state, onSubmit, pending } = useFormAction(addDependent, idle);
  const error = useFieldError(state);
  const [removing, startRemove] = useTransition();
  return (
    <Card className="flex flex-col gap-5">
      <CardHeader
        title={t("steps.dependents")}
        action={
          <span className="text-meta text-ink-muted">{t("optional")}</span>
        }
      />
      <p className="-mt-2 text-meta text-ink-muted">{td("intro")}</p>
      {ctx.dependents.length ? (
        <ul className="flex flex-col divide-y divide-border">
          {ctx.dependents.map((d) => (
            <li key={d.id} className="flex items-center gap-3 py-2">
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-body text-ink">{d.name}</span>
                <span className="text-meta text-ink-muted">
                  {[
                    td(`relationships.${d.relationship}`),
                    d.date_of_birth
                      ? td("born", {
                          date: formatDate(
                            dateFromIso(d.date_of_birth),
                            locale,
                            "full",
                          ),
                        })
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={td("removeConfirm", { name: d.name })}
                disabled={removing}
                onClick={() =>
                  startRemove(async () => void (await removeDependent(d.id)))
                }
              >
                <Trash2 aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      <form
        onSubmit={onSubmit}
        className="flex flex-col gap-4 rounded-tile bg-canvas p-4"
        noValidate
      >
        <p className="text-label text-ink">{td("add")}</p>
        <div className="grid gap-4 md:grid-cols-3">
          <TextField label={td("name")} name="name" error={error("name")} />
          <SelectField
            label={td("relationship")}
            name="relationship"
            defaultValue="child"
            error={error("relationship")}
          >
            {RELATIONSHIPS.map((r) => (
              <option key={r} value={r}>
                {td(`relationships.${r}`)}
              </option>
            ))}
          </SelectField>
          <TextField
            type="date"
            label={td("date_of_birth")}
            name="date_of_birth"
            error={error("date_of_birth")}
          />
        </div>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-body text-ink">
            <input
              type="checkbox"
              name="is_disabled"
              className="size-5 accent-primary"
            />
            {td("is_disabled")}
          </label>
          <label className="flex items-center gap-2 text-body text-ink">
            <input
              type="checkbox"
              name="in_tertiary_education"
              className="size-5 accent-primary"
            />
            {td("in_tertiary_education")}
          </label>
        </div>
        <div className="flex flex-col items-start gap-3">
          <Button type="submit" variant="outline" loading={pending}>
            {td("add")}
          </Button>
          <FormFeedback state={state} />
        </div>
      </form>
    </Card>
  );
}

/** HIR-04: credentials the role needs, and what has been uploaded (CRD-05). */
export function CredentialsSection({ ctx, done }: { ctx: Ctx; done: boolean }) {
  const t = useTranslations("Preboarding");
  const locale = useLocale();
  const [withdrawing, startWithdraw] = useTransition();
  const typeOf = new Map(ctx.types.map((x) => [x.id, x]));
  const latest = (typeId: string) =>
    [...ctx.credentials].reverse().find((c) => c.credential_type_id === typeId);
  const others = ctx.credentials.filter(
    (c) =>
      !ctx.required.some((r) => r.credential_type_id === c.credential_type_id),
  );
  const row = (
    typeId: string,
    requirement: "mandatory" | "optional" | null,
  ) => {
    const type = typeOf.get(typeId);
    const cred = latest(typeId);
    return (
      <li key={typeId} className="flex flex-wrap items-center gap-3 py-3">
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-body text-ink">
            {type ? typeName(type, locale) : ""}
          </span>
          <span className="text-meta text-ink-muted">
            {requirement === "mandatory"
              ? t("required")
              : requirement === "optional"
                ? t("optional")
                : t("extra")}
            {cred && cred.status === "draft" ? ` · ${t("notSent")}` : ""}
          </span>
        </span>
        {cred && cred.status !== "draft" ? (
          <StatusChip domain="credentialRecord" status={cred.status} />
        ) : null}
        {cred && (cred.status === "draft" || cred.status === "pending") ? (
          <Button
            type="button"
            variant="ghost"
            size="row"
            disabled={withdrawing}
            onClick={() =>
              startWithdraw(
                async () => void (await withdrawPreboardingCredential(cred.id)),
              )
            }
          >
            {t("removeUpload")}
          </Button>
        ) : null}
        {!cred || cred.status === "draft" || cred.status === "rejected" ? (
          <Link
            href={`/preboarding/credentials/new?type=${typeId}`}
            className={buttonVariants({ variant: "outline", size: "row" })}
          >
            <Upload aria-hidden />
            {t("upload")}
          </Link>
        ) : null}
      </li>
    );
  };
  return (
    <Card className="flex flex-col gap-4">
      <StepHeader title={t("steps.credentials")} done={done} />
      <p className="-mt-2 text-meta text-ink-muted">
        {ctx.required.length ? t("credentialsIntro") : t("credentialsNone")}
      </p>
      <ul className="flex flex-col divide-y divide-border">
        {ctx.required.map((r) => row(r.credential_type_id, r.requirement))}
        {[...new Set(others.map((c) => c.credential_type_id))].map((id) =>
          row(id, null),
        )}
      </ul>
      <Link
        href="/preboarding/credentials/new"
        className={cn(
          buttonVariants({ variant: "ghost", size: "row" }),
          "self-start",
        )}
      >
        {t("uploadOther")}
      </Link>
    </Card>
  );
}

/** "Send to HR" once everything is in. */
export function FinishSection({
  ready,
  submittedAt,
}: {
  ready: boolean;
  submittedAt: string | null;
}) {
  const t = useTranslations("Preboarding");
  const locale = useLocale();
  const [pending, startTransition] = useTransition();
  return (
    <Card className="flex flex-col gap-3">
      <CardHeader title={t("finishTitle")} />
      <p className="text-body text-ink-muted">
        {submittedAt
          ? t("finishDone", {
              date: formatDate(new Date(submittedAt), locale, "full"),
            })
          : ready
            ? t("finishReady")
            : t("finishNotReady")}
      </p>
      <Button
        type="button"
        variant="accent"
        className="self-start"
        loading={pending}
        disabled={!ready}
        onClick={() =>
          startTransition(async () => void (await finishPreboarding()))
        }
      >
        {submittedAt ? t("finishAgain") : t("finish")}
      </Button>
    </Card>
  );
}
