"use client";

import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type FormEvent,
} from "react";
import { Paperclip } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { FormFeedback, useFieldError } from "@/components/forms/FormFeedback";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/Card";
import { SelectField } from "@/components/ui/SelectField";
import { TextAreaField } from "@/components/ui/TextAreaField";
import { TextField } from "@/components/ui/TextField";
import { storageFileName } from "@/lib/files";
import { applyLeave, previewDays } from "@/lib/leave/actions";
import { days as fmt } from "@/lib/leave/logic";
import type { LeaveType } from "@/lib/leave/types";
import { idle, type FormState } from "@/lib/settings/form";
import { createClient } from "@/lib/supabase/client";

const FILE_TYPES = ["application/pdf", "image/jpeg", "image/png"];

// LVE-05 apply (staff, phone) and "record leave" (HR for someone). Shows how many working
// days the dates take (rest days, holidays, half days) and what is left after. A medical
// certificate goes from the browser to the private `leave` bucket, then the form is sent.
export function LeaveApplyForm({
  types,
  available,
  tenantId,
  employeeId,
  people,
  admin = false,
}: {
  types: readonly LeaveType[];
  /** Days left per leave type id (null = no cap) for the person applying. */
  available: Record<string, number | null>;
  tenantId: string;
  /** The applicant (staff: themself). Admin mode picks someone from `people`. */
  employeeId: string | null;
  people?: readonly { id: string; full_name: string }[];
  admin?: boolean;
}) {
  const t = useTranslations("Leave.apply");
  const locale = useLocale();
  const form = useRef<HTMLFormElement>(null);
  const [typeId, setTypeId] = useState(types[0]?.id ?? "");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [half, setHalf] = useState("");
  const [who, setWho] = useState(employeeId ?? "");
  const [count, setCount] = useState<number | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [problem, setProblem] = useState<
    "fileType" | "fileTooBig" | "uploadFailed" | null
  >(null);
  const [state, setState] = useState<FormState>(idle);
  const [pending, startTransition] = useTransition();
  const error = useFieldError(state);
  const type = types.find((x) => x.id === typeId);
  const name = (x: LeaveType) => (locale === "ms" ? x.name_ms : x.name_en);
  const single = start !== "" && (end === "" || end === start);

  useEffect(() => {
    let live = true;
    if (!typeId || !start) return;
    previewDays(
      typeId,
      start,
      end || start,
      single ? half || null : null,
      admin ? who || null : null,
    ).then((n) => live && setCount(n));
    return () => {
      live = false;
    };
  }, [typeId, start, end, half, who, single, admin]);

  const left = !admin && typeId in available ? available[typeId] : null;
  const after =
    left !== null && left !== undefined && count !== null ? left - count : null;

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setProblem(null);
    startTransition(async () => {
      if (file) {
        const owner = admin ? who : employeeId;
        const path = `${tenantId}/${owner}/${storageFileName(file.name, "certificate")}`;
        const { error: uploadError } = await createClient()
          .storage.from("leave")
          .upload(path, file, { contentType: file.type, upsert: false });
        if (uploadError) {
          setProblem("uploadFailed");
          return;
        }
        data.set("attachment_path", path);
      }
      const result = await applyLeave(idle, data);
      setState(result);
      if (result.status === "saved") {
        form.current?.reset();
        setStart("");
        setEnd("");
        setFile(null);
        setCount(null);
      }
    });
  };

  return (
    <form
      ref={form}
      onSubmit={onSubmit}
      className="flex flex-col gap-4"
      noValidate
    >
      <input type="hidden" name="locale" value={locale} />
      {admin ? null : <input type="hidden" name="then" value="staff" />}
      <Card className="flex flex-col gap-5">
        {admin && people ? (
          <SelectField
            label={t("employee")}
            name="employee_id"
            value={who}
            onChange={(e) => setWho(e.target.value)}
            error={error("employee_id")}
          >
            <option value="">{t("choose")}</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name}
              </option>
            ))}
          </SelectField>
        ) : null}
        <SelectField
          label={t("type")}
          name="leave_type_id"
          value={typeId}
          onChange={(e) => setTypeId(e.target.value)}
          error={error("leave_type_id")}
        >
          {types.map((x) => (
            <option key={x.id} value={x.id}>
              {name(x)}
              {!admin &&
              available[x.id] !== null &&
              available[x.id] !== undefined
                ? ` · ${t("left", { days: fmt(available[x.id]!) })}`
                : ""}
            </option>
          ))}
        </SelectField>
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField
            type="date"
            label={t("start_date")}
            name="start_date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            error={error("start_date")}
            required
          />
          <TextField
            type="date"
            label={t("end_date")}
            name="end_date"
            value={end}
            min={start || undefined}
            onChange={(e) => setEnd(e.target.value)}
            hint={t("end_dateHint")}
            error={error("end_date")}
          />
        </div>
        {single && !type?.counts_calendar_days ? (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-label text-ink">{t("halfDay")}</legend>
            <div className="flex flex-wrap gap-4">
              {[
                ["", t("fullDay")],
                ["am", t("am")],
                ["pm", t("pm")],
              ].map(([value, label]) => (
                <label
                  key={value}
                  className="flex items-center gap-2 text-body text-ink"
                >
                  <input
                    type="radio"
                    name="half_day"
                    value={value}
                    checked={half === value}
                    onChange={() => setHalf(value)}
                    className="size-5 accent-primary"
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}
        {count !== null && start ? (
          <p
            role="status"
            className="rounded-tile bg-primary-tint px-4 py-3 text-body text-primary-strong"
          >
            {count === 0
              ? t("noWorkingDays")
              : after !== null
                ? t("countAfter", { days: fmt(count), left: fmt(after) })
                : t("count", { days: fmt(count) })}
          </p>
        ) : null}
        <TextAreaField
          label={t("reason")}
          name="reason"
          rows={2}
          error={error("reason")}
        />
        {type?.requires_attachment ? (
          <div className="flex flex-col gap-2">
            <p className="text-label text-ink">{t("attachment")}</p>
            <p className="text-meta text-ink-muted">{t("attachmentHint")}</p>
            <label className="inline-flex min-h-11 w-fit cursor-pointer items-center gap-2 rounded-control border-[1.5px] border-primary bg-surface px-5 text-label text-primary-strong hover:bg-primary-tint">
              <Paperclip aria-hidden size={20} strokeWidth={1.75} />
              {file ? file.name : t("chooseFile")}
              <input
                type="file"
                accept={FILE_TYPES.join(",")}
                capture="environment"
                className="sr-only"
                onChange={(e) => {
                  const picked = e.target.files?.[0] ?? null;
                  e.target.value = "";
                  if (!picked) return;
                  if (!FILE_TYPES.includes(picked.type))
                    return setProblem("fileType");
                  if (picked.size > 10 * 1024 * 1024)
                    return setProblem("fileTooBig");
                  setProblem(null);
                  setFile(picked);
                }}
              />
            </label>
            {error("attachment") ? (
              <p className="text-meta font-medium text-danger">
                {error("attachment")}
              </p>
            ) : null}
          </div>
        ) : null}
        {admin ? (
          <label className="flex items-start gap-3 text-body text-ink">
            <input
              type="checkbox"
              name="override_negative"
              className="mt-0.5 size-5 accent-primary"
            />
            <span className="flex flex-col">
              {t("override")}
              <span className="text-meta text-ink-muted">
                {t("overrideHint")}
              </span>
            </span>
          </label>
        ) : null}
      </Card>
      <div className="flex flex-col gap-3">
        <Button
          type="submit"
          variant="accent"
          loading={pending}
          block={!admin}
          className={admin ? "self-start" : undefined}
        >
          {admin ? t("record") : t("submit")}
        </Button>
        {problem ? (
          <p role="alert" className="text-meta font-medium text-danger">
            {t(`problems.${problem}`)}
          </p>
        ) : (
          <FormFeedback state={state} />
        )}
      </div>
    </form>
  );
}
