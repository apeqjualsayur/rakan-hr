"use client";

import { useEffect, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  FormFeedback,
  useErrorText,
  useFieldError,
} from "@/components/forms/FormFeedback";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/Card";
import { SelectField } from "@/components/ui/SelectField";
import { StatusChip } from "@/components/ui/StatusChip";
import { TextField } from "@/components/ui/TextField";
import { dateFromIso, formatDate, formatMoney } from "@/lib/format";
import { idle, type FormState } from "@/lib/settings/form";
import { cancelOt, previewOt, requestOt } from "@/lib/time/actions";
import type { OtCalculation, OtRequest } from "@/lib/time/types";
import { useFormAction } from "@/lib/use-form-action";

/** "4 h × 1.5 × RM12.50/h = RM75.00" lines from calc_ot(). */
export function useOtLines() {
  const t = useTranslations("Time.ot");
  return (calc: OtCalculation | null) =>
    (calc?.lines ?? []).map((l) =>
      t(`lines.${l.rule}`, {
        hours: String(l.hours),
        multiplier: String(l.multiplier),
        rate: formatMoney(String(l.basis === "orp" ? calc!.orp : calc!.hrp)),
        amount: formatMoney(Number(l.amount).toFixed(2)),
      }),
    );
}

// ATT-04 request (staff for themselves; HR for anyone, approved straight away). Shows the
// day type and what calc_ot() would pay before it is sent.
export function OtForm({
  people,
}: {
  people?: readonly { id: string; full_name: string }[];
}) {
  const t = useTranslations("Time.ot");
  const { state, onSubmit, pending } = useFormAction(requestOt, idle);
  const error = useFieldError(state);
  const lines = useOtLines();
  const [date, setDate] = useState("");
  const [hours, setHours] = useState("");
  const [who, setWho] = useState("");
  const [calc, setCalc] = useState<OtCalculation | null>(null);

  useEffect(() => {
    let live = true;
    const h = Number(hours);
    if (!date || !(h > 0)) return;
    previewOt(date, h, people ? who || null : null).then(
      (c) => live && setCalc(c),
    );
    return () => {
      live = false;
    };
  }, [date, hours, who, people]);

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <Card className="flex flex-col gap-5">
        {people ? (
          <SelectField
            label={t("employee")}
            name="employee_id"
            value={who}
            onChange={(e) => setWho(e.target.value)}
          >
            <option value="">{t("choose")}</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name}
              </option>
            ))}
          </SelectField>
        ) : null}
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField
            type="date"
            label={t("date")}
            name="work_date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            error={error("work_date")}
          />
          <TextField
            label={t("hours")}
            name="hours"
            inputMode="decimal"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            hint={t("hoursHint")}
            error={error("hours")}
          />
        </div>
        <TextField label={t("reason")} name="reason" error={error("reason")} />
        {calc && date && Number(hours) > 0 ? (
          <div
            role="status"
            className="flex flex-col gap-1 rounded-tile bg-primary-tint px-4 py-3 text-meta text-primary-strong"
          >
            <p className="font-medium">
              {t(`dayTypes.${calc.day_type ?? "normal"}`)}
            </p>
            {calc.covered ? (
              <>
                {lines(calc).map((line) => (
                  <p key={line}>{line}</p>
                ))}
                <p className="text-body font-bold">
                  {t("total", {
                    amount: formatMoney(String(calc.amount ?? 0)),
                  })}
                </p>
              </>
            ) : (
              <p>{t(`notCovered.${calc.method as "none"}`)}</p>
            )}
            {calc.month_limit &&
            (calc.month_hours ?? 0) + Number(hours) > calc.month_limit ? (
              <p className="font-medium text-warning">
                {t("overLimit", {
                  hours: String((calc.month_hours ?? 0) + Number(hours)),
                  limit: String(calc.month_limit),
                })}
              </p>
            ) : null}
          </div>
        ) : null}
      </Card>
      <div className="flex flex-col items-start gap-3">
        <Button
          type="submit"
          variant={people ? "outline" : "primary"}
          loading={pending}
          block={!people}
        >
          {people ? t("record") : t("submit")}
        </Button>
        <FormFeedback state={state} />
      </div>
    </form>
  );
}

/** Own OT requests with status, amount once approved, and cancel while pending. */
export function MyOt({ requests }: { requests: readonly OtRequest[] }) {
  const t = useTranslations("Time.ot");
  const locale = useLocale();
  const errorText = useErrorText();
  const [result, setResult] = useState<FormState | null>(null);
  const [pending, startTransition] = useTransition();
  if (requests.length === 0)
    return <p className="text-body text-ink-muted">{t("none")}</p>;
  return (
    <ul className="flex flex-col divide-y divide-border">
      {requests.map((r) => (
        <li key={r.id} className="flex flex-wrap items-center gap-3 py-3">
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-body font-medium text-ink">
              {formatDate(dateFromIso(r.work_date), locale, "weekdayShort")} ·{" "}
              {t("hoursCount", { hours: Number(r.hours) })}
            </span>
            <span className="text-meta text-ink-muted">
              {[
                t(`dayTypes.${r.day_type}`),
                r.calculated_amount !== null
                  ? formatMoney(r.calculated_amount)
                  : null,
                r.decision_comment,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </span>
          <StatusChip domain="ot" status={r.status} />
          {r.status === "pending" ? (
            <Button
              type="button"
              variant="ghost"
              size="row"
              disabled={pending}
              onClick={() =>
                startTransition(async () => setResult(await cancelOt(r.id)))
              }
            >
              {t("cancel")}
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
