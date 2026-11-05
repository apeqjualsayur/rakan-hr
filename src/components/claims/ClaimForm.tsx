"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Camera, FileText, Paperclip, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useErrorText } from "@/components/forms/FormFeedback";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/Card";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import { useRouter } from "@/i18n/navigation";
import { submitClaim, type ClaimResult } from "@/lib/claims/actions";
import { cents, leftThisMonth, mileageAmount } from "@/lib/claims/logic";
import type { MyClaimType } from "@/lib/claims/types";
import { storageFileName } from "@/lib/files";
import { formatMoney } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";

const FILE_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
const MAX = 10 * 1024 * 1024;

// CLM-01 on the phone: type (with what is left this month), date, amount — or, for mileage,
// the distance at the company rate — what it was for, and receipt photos. Receipts go
// straight to the private `receipts` bucket under a new claim id, then the claim is sent.
export function ClaimForm({
  types,
  tenantId,
  employeeId,
  today,
}: {
  types: readonly MyClaimType[];
  tenantId: string;
  employeeId: string;
  today: string;
}) {
  const t = useTranslations("Claims.form");
  const locale = useLocale();
  const router = useRouter();
  const errorText = useErrorText();
  const [typeId, setTypeId] = useState(types[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [km, setKm] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [problem, setProblem] = useState<
    "fileType" | "fileTooBig" | "uploadFailed" | null
  >(null);
  const [result, setResult] = useState<ClaimResult>({ status: "idle" });
  const [pending, startTransition] = useTransition();
  const type = types.find((x) => x.id === typeId);
  const name = (x: MyClaimType) => (locale === "ms" ? x.name_ms : x.name_en);
  const left = type ? leftThisMonth(type.monthly_limit, type.claimed) : null;
  const value = type?.is_mileage
    ? mileageAmount(km, type.mileage_rate)
    : amount;
  const overMonthly = left !== null && value && cents(value) > cents(left);
  const overPerClaim =
    type?.per_claim_limit &&
    value &&
    cents(value) > cents(type.per_claim_limit);
  const fieldError = (n: string) =>
    result.status === "error" && result.errors?.[n]
      ? errorText(result.errors[n]!)
      : undefined;

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setProblem(null);
    startTransition(async () => {
      const claimId = crypto.randomUUID();
      const supabase = createClient();
      for (const file of files) {
        const path = `${tenantId}/${employeeId}/${claimId}/${storageFileName(file.name, "receipt")}`;
        const { error } = await supabase.storage
          .from("receipts")
          .upload(path, file, { contentType: file.type, upsert: false });
        if (error) {
          setProblem("uploadFailed");
          return;
        }
      }
      data.set("claim_id", claimId);
      data.set("is_mileage", String(Boolean(type?.is_mileage)));
      const r = await submitClaim(data);
      setResult(r);
      if (r.status === "saved") {
        router.push("/staff/claims?sent=1");
        router.refresh();
      }
    });
  };

  if (types.length === 0)
    return <p className="text-body text-ink-muted">{t("noTypes")}</p>;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <Card className="flex flex-col gap-5">
        <SelectField
          label={t("type")}
          name="claim_type_id"
          value={typeId}
          onChange={(e) => setTypeId(e.target.value)}
          error={fieldError("claim_type_id")}
        >
          {types.map((x) => (
            <option key={x.id} value={x.id}>
              {name(x)}
            </option>
          ))}
        </SelectField>
        {type ? (
          <p className="-mt-3 text-meta text-ink-muted">
            {[
              left !== null
                ? t("left", {
                    amount: formatMoney(left),
                    limit: formatMoney(type.monthly_limit!),
                  })
                : t("noMonthlyLimit"),
              type.per_claim_limit
                ? t("perClaim", { amount: formatMoney(type.per_claim_limit) })
                : null,
              type.is_taxable ? t("taxable") : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        ) : null}
        <TextField
          type="date"
          label={t("date")}
          name="expense_date"
          defaultValue={today}
          max={today}
          error={fieldError("expense_date")}
        />
        {type?.is_mileage ? (
          type.mileage_rate ? (
            <div className="flex flex-col gap-4 rounded-tile bg-canvas p-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField label={t("from")} name="trip_from" />
                <TextField label={t("to")} name="trip_to" />
              </div>
              <TextField
                label={t("distance")}
                name="distance_km"
                inputMode="decimal"
                value={km}
                onChange={(e) => setKm(e.target.value)}
                hint={t("rate", { rate: formatMoney(type.mileage_rate) })}
                error={fieldError("distance_km")}
              />
              {value ? (
                <p
                  role="status"
                  className="text-body font-medium text-primary-strong"
                >
                  {t("mileageAmount", {
                    km,
                    rate: formatMoney(type.mileage_rate),
                    amount: formatMoney(value),
                  })}
                </p>
              ) : null}
            </div>
          ) : (
            <p className="rounded-tile bg-warning-tint px-4 py-3 text-meta text-warning">
              {t("noRate")}
            </p>
          )
        ) : (
          <TextField
            label={t("amount")}
            name="amount"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            error={fieldError("amount")}
            className="tabular-nums"
          />
        )}
        {overPerClaim ? (
          <p className="text-meta font-medium text-danger">
            {t("overPerClaim", { amount: formatMoney(type!.per_claim_limit!) })}
          </p>
        ) : overMonthly ? (
          <p className="text-meta font-medium text-danger">
            {t("overMonthly", { amount: formatMoney(left!) })}
          </p>
        ) : null}
        <TextField
          label={t("description")}
          name="description"
          hint={t("descriptionHint")}
          error={fieldError("description")}
        />
      </Card>

      <Card className="flex flex-col gap-3">
        <p className="text-label text-ink">
          {type?.requires_receipt ? t("receipts") : t("receiptsOptional")}
        </p>
        <p className="-mt-2 text-meta text-ink-muted">{t("receiptsHint")}</p>
        <div className="flex flex-wrap gap-2">
          {[
            {
              label: t("takePhoto"),
              icon: Camera,
              capture: "environment" as const,
              multiple: false,
            },
            {
              label: t("chooseFiles"),
              icon: Paperclip,
              capture: undefined,
              multiple: true,
            },
          ].map(({ label, icon: Icon, capture, multiple }) => (
            <label
              key={label}
              className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-control border-[1.5px] border-primary bg-surface px-5 text-label text-primary-strong hover:bg-primary-tint"
            >
              <Icon aria-hidden size={20} strokeWidth={1.75} />
              {label}
              <input
                type="file"
                accept={FILE_TYPES.join(",")}
                capture={capture}
                multiple={multiple}
                className="sr-only"
                onChange={(e) => {
                  const picked = [...(e.target.files ?? [])];
                  e.target.value = "";
                  if (picked.some((f) => !FILE_TYPES.includes(f.type)))
                    return setProblem("fileType");
                  if (picked.some((f) => f.size > MAX))
                    return setProblem("fileTooBig");
                  setProblem(null);
                  setFiles((cur) => [...cur, ...picked].slice(0, 5));
                }}
              />
            </label>
          ))}
        </div>
        {files.length ? (
          <ul className="flex flex-col divide-y divide-border">
            {files.map((f, i) => (
              <li
                key={`${f.name}-${i}`}
                className="flex items-center gap-3 py-2"
              >
                <FileText
                  aria-hidden
                  size={20}
                  strokeWidth={1.75}
                  className="shrink-0 text-primary"
                />
                <span className="min-w-0 flex-1 truncate text-body text-ink">
                  {f.name}
                </span>
                <button
                  type="button"
                  aria-label={t("remove", { name: f.name })}
                  onClick={() =>
                    setFiles((cur) => cur.filter((_, n) => n !== i))
                  }
                  className="grid size-11 place-items-center rounded-full text-ink-soft hover:bg-canvas"
                >
                  <X aria-hidden size={18} />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {fieldError("receipt") ? (
          <p className="text-meta font-medium text-danger">
            {fieldError("receipt")}
          </p>
        ) : null}
      </Card>

      <div className="flex flex-col gap-3">
        <Button
          type="submit"
          variant="accent"
          block
          loading={pending}
          disabled={
            Boolean(overMonthly || overPerClaim) ||
            (type?.is_mileage && !type.mileage_rate)
          }
        >
          {t("submit")}
        </Button>
        {problem ? (
          <p role="alert" className="text-meta font-medium text-danger">
            {t(`problems.${problem}`)}
          </p>
        ) : result.status === "error" && result.message ? (
          <p role="alert" className="text-meta font-medium text-danger">
            {result.message === "monthlyLimit"
              ? t("overMonthly", { amount: formatMoney(result.limit ?? "0") })
              : result.message === "perClaimLimit"
                ? t("overPerClaim", {
                    amount: formatMoney(result.limit ?? "0"),
                  })
                : errorText(result.message)}
          </p>
        ) : null}
      </div>
    </form>
  );
}
