"use client";

import { useRef, useState, useTransition } from "react";
import { FileSearch, Send } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import {
  FormFeedback,
  useErrorText,
  useFieldError,
} from "@/components/forms/FormFeedback";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/Card";
import { SelectField } from "@/components/ui/SelectField";
import { StatusChip } from "@/components/ui/StatusChip";
import { TextAreaField } from "@/components/ui/TextAreaField";
import { TextField } from "@/components/ui/TextField";
import { formatDate, formatTime } from "@/lib/format";
import {
  resendLink,
  saveOffer,
  sendOffer,
  withdrawOffer,
  type SendState,
} from "@/lib/hiring/actions";
import { probationEnd, ringgit } from "@/lib/hiring/letters";
import { offerState } from "@/lib/hiring/logic";
import type { Offer } from "@/lib/hiring/types";
import {
  EMPLOYMENT_TYPES,
  PAY_MODELS,
  RATE_FIELD,
  type PayModel,
} from "@/lib/people/records";
import { idle, type FormState } from "@/lib/settings/form";
import { createClient } from "@/lib/supabase/client";
import { OpenFileButton } from "../OpenFileButton";

type Options = {
  roles: readonly { id: string; name: string }[];
  branches: readonly { id: string; name: string | null }[];
  managers: readonly { id: string; full_name: string }[];
};

// HIR-03 / HIR-04 / HIR-08 on the candidate page. A draft offer is edited here, previewed
// as the real PDF, then sent: the candidate gets an email with a single-use link and
// accepts by click-to-sign. A sent offer is withdrawn to change it.
export function OfferPanel({
  candidateId,
  candidateEmail,
  offer,
  defaults,
  canEdit,
  options,
  now,
}: {
  candidateId: string;
  candidateEmail: string;
  offer: Offer | null;
  defaults: Partial<Offer>;
  canEdit: boolean;
  options: Options;
  now: string;
}) {
  const t = useTranslations("Hiring.offer");
  const locale = useLocale();
  const state = offer ? offerState(offer, new Date(now)) : null;

  if (!offer || offer.status === "draft") {
    return canEdit ? (
      <OfferForm
        candidateId={candidateId}
        candidateEmail={candidateEmail}
        offer={offer}
        defaults={defaults}
        options={options}
      />
    ) : (
      <Card>
        <CardHeader title={t("title")} />
        <p className="mt-2 text-body text-ink-muted">{t("none")}</p>
      </Card>
    );
  }

  const when = (iso: string) =>
    `${formatDate(new Date(iso), locale, "full")}, ${formatTime(new Date(iso), locale)}`;
  return (
    <Card className="flex flex-col gap-4">
      <CardHeader
        title={t("title")}
        action={<StatusChip domain="offer" status={state!} />}
      />
      <OfferSummary offer={offer} options={options} />
      <p className="text-meta text-ink-muted">
        {offer.status === "accepted"
          ? t("acceptedOn", { date: when(offer.accepted_at!) })
          : state === "expired"
            ? t("expiredOn", { date: when(offer.expires_at!) })
            : t("sentOn", {
                date: when(offer.sent_at!),
                expires: formatDate(
                  new Date(offer.expires_at!),
                  locale,
                  "full",
                ),
                email: candidateEmail,
              })}
      </p>
      <div className="flex flex-wrap gap-2">
        <OpenFileButton
          kind="offer"
          id={offer.id}
          label={
            offer.status === "accepted" ? t("signedCopy") : t("openLetter")
          }
        />
        {canEdit ? (
          <SentActions offer={offer} accepted={offer.status === "accepted"} />
        ) : null}
      </div>
    </Card>
  );
}

function OfferSummary({ offer, options }: { offer: Offer; options: Options }) {
  const t = useTranslations("Hiring.offer");
  const te = useTranslations("People.employment");
  const locale = useLocale();
  const rate = offer[RATE_FIELD[offer.pay_model]];
  const end = probationEnd(offer.start_date, offer.probation_months);
  const rows: [string, string][] = [
    [t("job_title"), offer.job_title],
    [t("employment_type"), te(`employmentTypes.${offer.employment_type}`)],
    [t("pay"), `${ringgit(rate)} · ${te(`payModels.${offer.pay_model}`)}`],
    [
      t("start_date"),
      formatDate(
        new Date(`${offer.start_date}T00:00:00+08:00`),
        locale,
        "full",
      ),
    ],
    [
      t("probation"),
      offer.probation_months > 0 && end
        ? t("probationValue", {
            months: offer.probation_months,
            date: formatDate(new Date(`${end}T00:00:00+08:00`), locale, "full"),
          })
        : t("noProbation"),
    ],
    [
      t("branch_id"),
      options.branches.find((b) => b.id === offer.branch_id)?.name ??
        t("anyBranch"),
    ],
    [
      t("manager_id"),
      options.managers.find((m) => m.id === offer.manager_id)?.full_name ??
        t("noManager"),
    ],
    [t("letter_locale"), t(`locales.${offer.locale}`)],
  ];
  return (
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
      {rows.map(([label, value]) => (
        <div key={label} className="flex flex-col">
          <dt className="text-meta text-ink-muted">{label}</dt>
          <dd className="text-body text-ink">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function SentActions({ offer, accepted }: { offer: Offer; accepted: boolean }) {
  const t = useTranslations("Hiring.offer");
  const errorText = useErrorText();
  const [result, setResult] = useState<SendState | null>(null);
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);
  const [pending, startTransition] = useTransition();
  const run = (action: () => Promise<SendState | FormState>) =>
    startTransition(async () => setResult(await action()));
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="row"
        loading={pending}
        onClick={() => run(() => resendLink(offer.id))}
      >
        <Send aria-hidden />
        {t("resend")}
      </Button>
      {accepted ? null : confirmWithdraw ? (
        <span className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="danger-outline"
            size="row"
            loading={pending}
            onClick={() => run(() => withdrawOffer(offer.id))}
          >
            {t("confirmWithdraw")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="row"
            onClick={() => setConfirmWithdraw(false)}
          >
            {t("cancel")}
          </Button>
        </span>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="row"
          onClick={() => setConfirmWithdraw(true)}
        >
          {t("withdraw")}
        </Button>
      )}
      {result ? (
        <p
          role={result.status === "error" ? "alert" : "status"}
          className={
            result.status === "error"
              ? "w-full text-meta font-medium text-danger"
              : "w-full text-meta font-medium text-primary"
          }
        >
          {result.status === "error"
            ? errorText(result.message ?? "saveFailed")
            : "emailError" in result && result.emailError
              ? t("linkMadeNoEmail")
              : t("linkSent")}
        </p>
      ) : null}
    </>
  );
}

function OfferForm({
  candidateId,
  candidateEmail,
  offer,
  defaults,
  options,
}: {
  candidateId: string;
  candidateEmail: string;
  offer: Offer | null;
  defaults: Partial<Offer>;
  options: Options;
}) {
  const t = useTranslations("Hiring.offer");
  const te = useTranslations("People.employment");
  const errorText = useErrorText();
  const values = offer ?? defaults;
  const form = useRef<HTMLFormElement>(null);
  const [payModel, setPayModel] = useState<PayModel>(
    values.pay_model ?? "monthly",
  );
  const [employmentType, setEmploymentType] = useState(
    values.employment_type ?? "full_time",
  );
  const [state, setState] = useState<FormState>(idle);
  const [message, setMessage] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const error = useFieldError(state);

  /** Saves the form first, so preview and send always use what is on screen. */
  const saveFirst = async () => {
    const result = await saveOffer(idle, new FormData(form.current!));
    setState(result);
    return result.status === "saved";
  };

  const preview = () =>
    startTransition(async () => {
      setMessage(null);
      const tab = window.open("", "_blank");
      if (!(await saveFirst()) || !offer) {
        tab?.close();
        if (!offer) setMessage(t("saveFirst"));
        return;
      }
      const { data, error: invokeError } =
        await createClient().functions.invoke("hiring", {
          body: { action: "preview_offer", offer_id: offer.id },
        });
      if (invokeError || !(data instanceof Blob)) {
        tab?.close();
        setMessage(t("previewFailed"));
        return;
      }
      const url = URL.createObjectURL(
        new Blob([data], { type: "application/pdf" }),
      );
      if (tab) tab.location.href = url;
      else window.location.href = url;
    });

  const send = () =>
    startTransition(async () => {
      setMessage(null);
      if (!(await saveFirst()) || !offer) return;
      const result = await sendOffer(offer.id);
      setConfirming(false);
      if (result.status === "error") setState(result);
      else setMessage(result.emailError ? t("sentNoEmail") : null);
    });

  return (
    <form
      ref={form}
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          setMessage(null);
          await saveFirst();
        });
      }}
      className="flex flex-col gap-4"
      noValidate
    >
      <input type="hidden" name="candidate_id" value={candidateId} />
      {offer ? <input type="hidden" name="offer_id" value={offer.id} /> : null}
      <Card className="flex flex-col gap-5">
        <CardHeader
          title={t("title")}
          action={offer ? <StatusChip domain="offer" status="draft" /> : null}
        />
        <p className="-mt-2 text-meta text-ink-muted">{t("draftHint")}</p>
        <div className="grid gap-5 md:grid-cols-2">
          <TextField
            label={t("job_title")}
            name="job_title"
            defaultValue={values.job_title ?? ""}
            error={error("job_title")}
            required
          />
          <SelectField
            label={t("letter_locale")}
            name="letter_locale"
            defaultValue={values.locale ?? "en"}
          >
            <option value="en">{t("locales.en")}</option>
            <option value="ms">{t("locales.ms")}</option>
          </SelectField>
          <SelectField
            label={t("job_role_id")}
            name="job_role_id"
            defaultValue={values.job_role_id ?? ""}
            hint={t("job_roleHint")}
            error={error("job_role_id")}
          >
            <option value="">{t("noRole")}</option>
            {options.roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </SelectField>
          <SelectField
            label={t("branch_id")}
            name="branch_id"
            defaultValue={values.branch_id ?? ""}
            error={error("branch_id")}
          >
            <option value="">{t("anyBranch")}</option>
            {options.branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name ?? t("unnamedBranch")}
              </option>
            ))}
          </SelectField>
          <SelectField
            label={t("manager_id")}
            name="manager_id"
            defaultValue={values.manager_id ?? ""}
            error={error("manager_id")}
          >
            <option value="">{t("noManager")}</option>
            {options.managers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.full_name}
              </option>
            ))}
          </SelectField>
          <SelectField
            label={t("employment_type")}
            name="employment_type"
            value={employmentType}
            onChange={(e) =>
              setEmploymentType(e.target.value as typeof employmentType)
            }
            error={error("employment_type")}
          >
            {EMPLOYMENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {te(`employmentTypes.${type}`)}
              </option>
            ))}
          </SelectField>
          <SelectField
            label={t("pay_model")}
            name="pay_model"
            value={payModel}
            onChange={(e) => setPayModel(e.target.value as PayModel)}
            error={error("pay_model")}
          >
            {PAY_MODELS.map((model) => (
              <option key={model} value={model}>
                {te(`payModels.${model}`)}
              </option>
            ))}
          </SelectField>
          <TextField
            key={payModel}
            label={te(RATE_FIELD[payModel])}
            name={RATE_FIELD[payModel]}
            inputMode="decimal"
            defaultValue={values[RATE_FIELD[payModel]] ?? ""}
            error={error(RATE_FIELD[payModel])}
            className="tabular-nums"
            required
          />
          <TextField
            label={te("normal_hours_per_day")}
            name="normal_hours_per_day"
            inputMode="decimal"
            defaultValue={values.normal_hours_per_day ?? ""}
            error={error("normal_hours_per_day")}
            required
          />
          <TextField
            label={te("work_days_per_week")}
            name="work_days_per_week"
            inputMode="decimal"
            defaultValue={values.work_days_per_week ?? ""}
            error={error("work_days_per_week")}
            required
          />
          <TextField
            type="date"
            label={t("start_date")}
            name="start_date"
            defaultValue={values.start_date ?? ""}
            error={error("start_date")}
            required
          />
          <TextField
            label={t("probation_months")}
            name="probation_months"
            inputMode="numeric"
            defaultValue={values.probation_months ?? ""}
            hint={t("probation_monthsHint")}
            error={error("probation_months")}
            required
          />
          {employmentType === "contract" || values.contract_end_date ? (
            <TextField
              type="date"
              label={t("contract_end_date")}
              name="contract_end_date"
              defaultValue={values.contract_end_date ?? ""}
              error={error("contract_end_date")}
            />
          ) : null}
          <TextAreaField
            className="md:col-span-2"
            label={t("extra_terms")}
            name="extra_terms"
            defaultValue={values.extra_terms ?? ""}
            hint={t("extra_termsHint")}
            error={error("extra_terms")}
            rows={3}
          />
        </div>
      </Card>

      {confirming && offer ? (
        <Card className="flex flex-col gap-3 border-accent">
          <p className="text-body text-ink">
            {t("confirmSend", { email: candidateEmail })}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="accent"
              loading={pending}
              onClick={send}
            >
              <Send aria-hidden />
              {t("sendNow")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setConfirming(false)}
            >
              {t("cancel")}
            </Button>
          </div>
        </Card>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="submit"
            variant={offer ? "outline" : "primary"}
            loading={pending}
          >
            {offer ? t("saveDraft") : t("createDraft")}
          </Button>
          {offer ? (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={preview}
                disabled={pending}
              >
                <FileSearch aria-hidden />
                {t("preview")}
              </Button>
              <Button
                type="button"
                variant="accent"
                disabled={pending}
                onClick={() => setConfirming(true)}
              >
                <Send aria-hidden />
                {t("send")}
              </Button>
            </>
          ) : null}
        </div>
      )}
      {message ? (
        <p role="status" className="text-meta font-medium text-ink-soft">
          {message}
        </p>
      ) : state.status === "error" && state.message ? (
        <p role="alert" className="text-meta font-medium text-danger">
          {errorText(state.message)}
        </p>
      ) : (
        <FormFeedback state={state} />
      )}
    </form>
  );
}
