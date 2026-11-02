"use client";

import { useTranslations } from "next-intl";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import type { Bank } from "@/lib/people/records";

// EMP-05 bank, account number and holder. Used by HR (Bank tab) and staff (bank change
// request). Any bank: the payment file decides same-bank vs interbank per line.
export function BankAccountFields({
  banks,
  error,
}: {
  banks: readonly Bank[];
  error: (name: string) => string | undefined;
}) {
  const t = useTranslations("People.bank");
  const tp = useTranslations("People.personal");
  return (
    <div className="grid gap-5 md:grid-cols-3">
      <SelectField
        label={t("bank_code")}
        name="bank_code"
        defaultValue=""
        error={error("bank_code")}
      >
        <option value="">{tp("choose")}</option>
        {banks.map((b) => (
          <option key={b.code} value={b.code}>
            {b.name}
          </option>
        ))}
      </SelectField>
      <TextField
        label={t("account_no")}
        name="account_no"
        inputMode="numeric"
        autoComplete="off"
        error={error("account_no")}
        className="tabular-nums"
      />
      <TextField
        label={t("holder_name")}
        name="holder_name"
        hint={t("holder_nameHint")}
        autoComplete="off"
        error={error("holder_name")}
      />
    </div>
  );
}
