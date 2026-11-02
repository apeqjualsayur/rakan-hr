"use client";

import { useState, useTransition } from "react";
import { Pencil } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import {
  FormFeedback,
  useErrorText,
  useFieldError,
} from "@/components/forms/FormFeedback";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/ui/SelectField";
import { StatusChip } from "@/components/ui/StatusChip";
import { TextField } from "@/components/ui/TextField";
import { formatDate } from "@/lib/format";
import {
  describeChangeValue,
  type ChangeField,
  type ChangeRequest,
} from "@/lib/people/changes";
import type { EmergencyContact } from "@/lib/people/employee";
import { bankName, type Bank } from "@/lib/people/records";
import { idle, type FormState } from "@/lib/settings/form";
import { useFormAction } from "@/lib/use-form-action";
import { BankAccountFields } from "@/components/people/BankAccountFields";
import { myDocumentUrl, requestChange, withdrawChange } from "./actions";

type Current = {
  phone: string | null;
  email: string | null;
  address: string | null;
  emergency_contact: EmergencyContact;
};

// "Request change" (EMP-07): pick what to change, fill in the new value, send it to HR.
// Nothing changes until HR approves; bank changes always need HR approval.
export function ChangeRequestButton({
  fields,
  current,
  banks = [],
  pendingFields,
}: {
  fields: readonly ChangeField[];
  current?: Current;
  banks?: readonly Bank[];
  /** Fields that already have a request waiting (one at a time). */
  pendingFields: readonly ChangeField[];
}) {
  const t = useTranslations("People.me");
  const tr = useTranslations("People.requests.fields");
  const tp = useTranslations("People.personal");
  const available = fields.filter((f) => !pendingFields.includes(f));
  const [open, setOpen] = useState(false);
  const [field, setField] = useState<ChangeField>(available[0] ?? fields[0]!);
  const { state, onSubmit, pending } = useFormAction(
    async (previous: FormState, data: FormData) => {
      const result = await requestChange(previous, data);
      if (result.status === "saved") setOpen(false);
      return result;
    },
    idle,
  );
  const error = useFieldError(state);

  // Everything here already has a request waiting (e.g. the one just sent).
  if (available.length === 0)
    return state.status === "saved" ? (
      <p role="status" className="text-meta font-medium text-primary">
        {t("sent")}
      </p>
    ) : null;
  if (!open) {
    return (
      <div className="flex flex-col gap-2">
        {state.status === "saved" ? (
          <p role="status" className="text-meta font-medium text-primary">
            {t("sent")}
          </p>
        ) : null}
        <Button
          variant="outline"
          size="row"
          className="w-fit"
          onClick={() => {
            setField(available[0]!);
            setOpen(true);
          }}
        >
          <Pencil aria-hidden />
          {t("requestChange")}
        </Button>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-4 rounded-tile border border-border bg-canvas p-4"
      noValidate
    >
      {available.length > 1 ? (
        <SelectField
          label={t("requestChange")}
          name="field"
          value={field}
          onChange={(e) => setField(e.target.value as ChangeField)}
        >
          {available.map((f) => (
            <option key={f} value={f}>
              {tr(f)}
            </option>
          ))}
        </SelectField>
      ) : (
        <input type="hidden" name="field" value={field} />
      )}

      {field === "phone" || field === "email" || field === "address" ? (
        <TextField
          key={field}
          label={tr(field)}
          name="value"
          type={
            field === "email" ? "email" : field === "phone" ? "tel" : "text"
          }
          defaultValue={current?.[field] ?? ""}
          error={error("value")}
        />
      ) : null}
      {field === "emergency_contact" ? (
        <div className="grid gap-4">
          <TextField
            label={tp("emergency_name")}
            name="emergency_name"
            defaultValue={current?.emergency_contact.name ?? ""}
            error={error("emergency_name")}
          />
          <TextField
            label={tp("emergency_relationship")}
            name="emergency_relationship"
            defaultValue={current?.emergency_contact.relationship ?? ""}
            error={error("emergency_relationship")}
          />
          <TextField
            type="tel"
            label={tp("emergency_phone")}
            name="emergency_phone"
            defaultValue={current?.emergency_contact.phone ?? ""}
            error={error("emergency_phone")}
          />
        </div>
      ) : null}
      {field === "bank_account" ? (
        <>
          <p className="text-meta font-medium text-danger">{t("bankNote")}</p>
          <BankAccountFields banks={banks} error={error} />
        </>
      ) : null}

      <TextField label={t("note")} name="note" error={error("note")} />
      <div className="flex flex-col items-start gap-3">
        <div className="flex flex-wrap gap-2">
          <Button type="submit" loading={pending}>
            {t("send")}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            {t("cancel")}
          </Button>
        </div>
        <FormFeedback state={state} />
      </div>
    </form>
  );
}

export type MyRequest = ChangeRequest & { comment: string | null };

/** The employee's recent requests, newest first; pending ones can be withdrawn. */
export function MyRequests({
  requests,
  banks,
}: {
  requests: readonly MyRequest[];
  banks: readonly Bank[];
}) {
  const t = useTranslations("People.me");
  const tr = useTranslations("People.requests.fields");
  const locale = useLocale();
  const errorText = useErrorText();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<FormState | null>(null);

  return (
    <ul className="divide-y divide-border">
      {requests.map((r) => (
        <li key={r.id} className="flex flex-col gap-2 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-h3 text-ink">{tr(r.field)}</p>
              <p className="text-meta text-ink-soft">
                {describeChangeValue(r.field, r.new_value, (c) =>
                  bankName(banks, c),
                )}
              </p>
              <p className="text-meta text-ink-muted">
                {formatDate(new Date(r.created_at), locale, "full")}
              </p>
            </div>
            <StatusChip domain="changeRequest" status={r.status} />
          </div>
          {r.status === "rejected" && r.comment ? (
            <p className="text-meta text-danger">
              {t("reason", { comment: r.comment })}
            </p>
          ) : null}
          {r.status === "pending" ? (
            <Button
              variant="ghost"
              size="row"
              className="w-fit"
              disabled={pending}
              onClick={() => {
                if (window.confirm(t("withdrawConfirm")))
                  startTransition(async () =>
                    setResult(await withdrawChange(r.id)),
                  );
              }}
            >
              {t("withdraw")}
            </Button>
          ) : null}
        </li>
      ))}
      {result?.status === "error" ? (
        <li role="alert" className="py-2 text-meta font-medium text-danger">
          {errorText(result.message ?? "saveFailed")}
        </li>
      ) : null}
    </ul>
  );
}

/** Opens one of the employee's own documents through a 5-minute signed link. */
export function ViewDocumentButton({ documentId }: { documentId: string }) {
  const t = useTranslations("People.documents");
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);
  return (
    <span className="flex flex-col items-end gap-1">
      <Button
        variant="outline"
        size="row"
        disabled={pending}
        onClick={() => {
          setFailed(false);
          const tab = window.open("", "_blank");
          startTransition(async () => {
            const res = await myDocumentUrl(documentId);
            if ("url" in res && tab) {
              tab.opener = null;
              tab.location.href = res.url;
            } else {
              tab?.close();
              setFailed(true);
            }
          });
        }}
      >
        {t("view")}
      </Button>
      {failed ? (
        <span role="alert" className="text-meta text-danger">
          {t("problems.openFailed")}
        </span>
      ) : null}
    </span>
  );
}
