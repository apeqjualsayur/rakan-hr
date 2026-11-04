"use client";

import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { FormFeedback, useFieldError } from "@/components/forms/FormFeedback";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/Card";
import { TextField } from "@/components/ui/TextField";
import { addCompanyHoliday, removeCompanyHoliday } from "@/lib/leave/actions";
import { idle } from "@/lib/settings/form";
import { useFormAction } from "@/lib/use-form-action";

/** A holiday the company gives on top of the gazetted ones (e.g. its anniversary). */
export function HolidayForm() {
  const t = useTranslations("Leave.holidays");
  const { state, onSubmit, pending } = useFormAction(addCompanyHoliday, idle);
  const error = useFieldError(state);
  return (
    <Card className="flex flex-col gap-4">
      <CardHeader title={t("addTitle")} as="h3" />
      <p className="-mt-2 text-meta text-ink-muted">{t("addIntro")}</p>
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField
            type="date"
            label={t("date")}
            name="holiday_date"
            error={error("holiday_date")}
          />
          <TextField
            label={t("nameEn")}
            name="name_en"
            error={error("name_en")}
          />
          <TextField
            label={t("nameMs")}
            name="name_ms"
            error={error("name_ms")}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" variant="accent" loading={pending}>
            {t("add")}
          </Button>
          <FormFeedback state={state} />
        </div>
      </form>
    </Card>
  );
}

export function RemoveHolidayButton({ id }: { id: string }) {
  const t = useTranslations("Leave.holidays");
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={t("remove")}
      disabled={pending}
      onClick={() =>
        startTransition(async () => void (await removeCompanyHoliday(id)))
      }
    >
      <Trash2 aria-hidden />
    </Button>
  );
}
