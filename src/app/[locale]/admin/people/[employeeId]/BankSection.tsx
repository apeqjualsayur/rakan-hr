"use client";

import { useEffect, useState } from "react";
import { Landmark } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { FormFeedback, useFieldError } from "@/components/forms/FormFeedback";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/Card";
import { CategoryTag } from "@/components/ui/CategoryTag";
import { EmptyState } from "@/components/ui/EmptyState";
import { MaskedValue } from "@/components/ui/MaskedValue";
import { StatusChip } from "@/components/ui/StatusChip";
import { Link } from "@/i18n/navigation";
import { formatDate } from "@/lib/format";
import { bankName, type Bank, type BankAccount } from "@/lib/people/records";
import { idle } from "@/lib/settings/form";
import { useFormAction } from "@/lib/use-form-action";
import { addBankAccount, revealAccountNo } from "../actions";
import { BankAccountFields } from "@/components/people/BankAccountFields";
import { RevealValue } from "../_components/RevealValue";

// Bank tab (EMP-05). Payroll pays the one primary account. Numbers are encrypted at rest
// and shown masked; owner / HR admin can reveal one (logged). A change the employee asked
// for waits here, flagged, until it is approved in Change requests.
export function BankSection({
  employeeId,
  accounts,
  banks,
  hasPendingRequest,
  canEdit,
}: {
  employeeId: string;
  accounts: readonly BankAccount[];
  banks: readonly Bank[];
  hasPendingRequest: boolean;
  canEdit: boolean;
}) {
  const t = useTranslations("People.bank");
  const locale = useLocale();
  const [adding, setAdding] = useState(false);
  const primary = accounts.find((a) => a.is_primary) ?? null;
  const pending = accounts.filter((a) => a.status === "pending");
  const history = accounts.filter(
    (a) => !a.is_primary && a.status !== "pending",
  );

  return (
    <>
      <Card className="flex flex-col gap-4">
        <CardHeader title={t("title")} />
        <p className="-mt-2 text-meta text-ink-muted">{t("intro")}</p>
        {primary ? (
          <div className="flex items-start gap-4 rounded-tile border border-border p-4">
            <span
              aria-hidden
              className="grid size-12 shrink-0 place-items-center rounded-control bg-primary-tint text-primary"
            >
              <Landmark size={24} strokeWidth={1.75} />
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <RevealValue
                prefix={bankName(banks, primary.bank_code)}
                last4={primary.account_no_last4}
                reveal={() => revealAccountNo(primary.id)}
              />
              <p className="text-meta text-ink-muted">
                {[
                  t("holder", { name: primary.holder_name }),
                  primary.verified_at
                    ? t("verified", {
                        date: formatDate(
                          new Date(primary.verified_at),
                          locale,
                          "full",
                        ),
                      })
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            <StatusChip domain="bankAccount" status="active" />
          </div>
        ) : (
          <EmptyState message={t("none")} className="py-2" />
        )}

        {pending.map((a) => (
          <div
            key={a.id}
            className="flex flex-col gap-2 rounded-tile border border-danger/40 bg-danger-tint/40 p-4"
          >
            <div className="flex flex-wrap items-center gap-2">
              <CategoryTag category="bank_change" />
              <span className="text-h3 text-ink">{t("pendingTitle")}</span>
            </div>
            <p className="text-meta text-ink-soft">
              {t("pendingBody", {
                account: `${bankName(banks, a.bank_code)} ••${a.account_no_last4}`,
              })}
            </p>
            {hasPendingRequest ? (
              <Link
                href="/admin/people/requests"
                className="w-fit text-label text-primary underline-offset-4 hover:underline"
              >
                {t("review")}
              </Link>
            ) : null}
          </div>
        ))}

        {canEdit && !adding ? (
          <div>
            <Button
              variant="outline"
              size="row"
              onClick={() => setAdding(true)}
            >
              {primary ? t("replace") : t("add")}
            </Button>
          </div>
        ) : null}
        {canEdit && adding ? (
          <AddBankForm
            employeeId={employeeId}
            banks={banks}
            replacing={Boolean(primary)}
            onDone={() => setAdding(false)}
          />
        ) : null}
      </Card>

      {history.length ? (
        <Card className="flex flex-col gap-2">
          <CardHeader title={t("history")} as="h3" />
          <ul className="divide-y divide-border">
            {history.map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between gap-3 py-3"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="text-body text-ink">
                    <MaskedValue
                      prefix={bankName(banks, a.bank_code)}
                      value={a.account_no_last4}
                    />
                  </span>
                  <span className="text-meta text-ink-muted">
                    {t("holder", { name: a.holder_name })}
                  </span>
                </span>
                <StatusChip domain="bankAccount" status={a.status} />
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </>
  );
}

function AddBankForm({
  employeeId,
  banks,
  replacing,
  onDone,
}: {
  employeeId: string;
  banks: readonly Bank[];
  replacing: boolean;
  onDone: () => void;
}) {
  const t = useTranslations("People.bank");
  const { state, onSubmit, pending } = useFormAction(addBankAccount, idle);
  const error = useFieldError(state);
  const savedAt = state.status === "saved" ? state.at : null;
  useEffect(() => {
    if (savedAt !== null) onDone();
  }, [savedAt, onDone]);

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-5 rounded-tile border border-border bg-canvas p-4"
      noValidate
    >
      <input type="hidden" name="employee_id" value={employeeId} />
      {replacing ? (
        <p className="text-meta text-ink-muted">{t("replaceHint")}</p>
      ) : null}
      <BankAccountFields banks={banks} error={error} />
      <div className="flex flex-col items-start gap-3 md:flex-row md:items-center">
        <Button type="submit" variant="accent" loading={pending}>
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
