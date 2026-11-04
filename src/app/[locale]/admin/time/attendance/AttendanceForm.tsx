"use client";

import { useTransition } from "react";
import { Camera } from "lucide-react";
import { useTranslations } from "next-intl";
import { FormFeedback, useFieldError } from "@/components/forms/FormFeedback";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/Card";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import { idle } from "@/lib/settings/form";
import { recordAttendance, selfieUrl } from "@/lib/time/actions";
import { useFormAction } from "@/lib/use-form-action";

/** HR records attendance by hand (no phone, forgotten clock-in), with a reason. */
export function AttendanceForm({
  people,
}: {
  people: readonly { id: string; full_name: string }[];
}) {
  const t = useTranslations("Time.attendance");
  const { state, onSubmit, pending } = useFormAction(recordAttendance, idle);
  const error = useFieldError(state);
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <Card className="grid gap-4 md:grid-cols-5">
        <SelectField
          className="md:col-span-2"
          label={t("person")}
          name="employee_id"
          defaultValue=""
          error={error("employee_id")}
        >
          <option value="">{t("choose")}</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.full_name}
            </option>
          ))}
        </SelectField>
        <TextField
          type="date"
          label={t("day")}
          name="work_date"
          error={error("work_date")}
        />
        <TextField
          type="time"
          label={t("in")}
          name="clock_in"
          error={error("clock_in")}
        />
        <TextField
          type="time"
          label={t("out")}
          name="clock_out"
          error={error("clock_out")}
        />
        <TextField
          className="md:col-span-5"
          label={t("reason")}
          name="reason"
          error={error("reason")}
        />
      </Card>
      <div className="flex flex-col items-start gap-3">
        <Button type="submit" variant="outline" loading={pending}>
          {t("record")}
        </Button>
        <FormFeedback state={state} />
      </div>
    </form>
  );
}

export function SelfieButton({ logId }: { logId: string }) {
  const t = useTranslations("Time.attendance");
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      variant="ghost"
      size="row"
      loading={pending}
      onClick={() =>
        startTransition(async () => {
          const tab = window.open("", "_blank");
          const r = await selfieUrl(logId);
          if ("url" in r && tab) tab.location.href = r.url;
          else tab?.close();
        })
      }
    >
      <Camera aria-hidden />
      {t("selfie")}
    </Button>
  );
}
