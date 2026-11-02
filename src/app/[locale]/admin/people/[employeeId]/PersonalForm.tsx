"use client";

import { useRef, useState, useTransition } from "react";
import { Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  FormFeedback,
  useErrorText,
  useFieldError,
} from "@/components/forms/FormFeedback";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/Card";
import { PersonAvatar } from "@/components/ui/PersonRow";
import type { Employee } from "@/lib/people/employee";
import { PHOTO_FILES, photoFileProblem, photoPath } from "@/lib/people/records";
import { idle, type FormState } from "@/lib/settings/form";
import { createClient } from "@/lib/supabase/client";
import { useFormAction } from "@/lib/use-form-action";
import { removePhoto, savePersonal, setPhoto } from "../actions";
import { PersonalFields } from "../_components/PersonalFields";

// Personal tab (EMP-01, EMP-02). One accent action: Save changes.
export function PersonalForm({
  employee,
  photoUrl,
  tenantId,
  canEdit,
  canReveal,
}: {
  employee: Employee;
  photoUrl?: string;
  tenantId: string;
  canEdit: boolean;
  canReveal: boolean;
}) {
  const ts = useTranslations("Settings");
  const { state, onSubmit, pending } = useFormAction(savePersonal, idle);
  const error = useFieldError(state);

  return (
    <>
      <PhotoCard
        employee={employee}
        photoUrl={photoUrl}
        tenantId={tenantId}
        canEdit={canEdit}
      />
      <form onSubmit={onSubmit} className="flex flex-col gap-6" noValidate>
        <input type="hidden" name="employee_id" value={employee.id} />
        <fieldset disabled={!canEdit} className="flex min-w-0 flex-col gap-6">
          <PersonalFields
            employee={employee}
            error={error}
            canReveal={canReveal}
          />
        </fieldset>
        {canEdit ? (
          <div className="flex flex-col items-start gap-3 md:flex-row md:items-center">
            <Button type="submit" variant="accent" loading={pending}>
              {ts("save")}
            </Button>
            <FormFeedback state={state} />
          </div>
        ) : null}
      </form>
    </>
  );
}

type Problem = "fileType" | "fileTooBig" | "uploadFailed";

/** Profile photo for the directory (bucket `avatars`, private; shown via signed links). */
function PhotoCard({
  employee,
  photoUrl,
  tenantId,
  canEdit,
}: {
  employee: Employee;
  photoUrl?: string;
  tenantId: string;
  canEdit: boolean;
}) {
  const t = useTranslations("People.personal");
  const errorText = useErrorText();
  const input = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [problem, setProblem] = useState<Problem | null>(null);
  const [result, setResult] = useState<FormState>(idle);

  const upload = (file: File) => {
    const issue = photoFileProblem(file);
    setProblem(issue);
    setResult(idle);
    if (issue) return;
    startTransition(async () => {
      const path = photoPath(tenantId, employee.id, file.type);
      const { error } = await createClient()
        .storage.from("avatars")
        .upload(path, file, { contentType: file.type, upsert: true });
      if (error) {
        setProblem("uploadFailed");
        return;
      }
      setResult(await setPhoto(employee.id, path));
    });
  };

  return (
    <Card className="flex flex-col gap-4 md:flex-row md:items-center">
      <PersonAvatar
        id={employee.id}
        name={employee.full_name}
        photoUrl={photoUrl}
        className="size-20 text-h2"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <CardHeader title={t("photo")} as="h3" />
        <p className="text-meta text-ink-muted">{t("photoHint")}</p>
        {problem ? (
          <p role="alert" className="text-meta font-medium text-danger">
            {t(`problems.${problem}`)}
          </p>
        ) : result.status === "error" ? (
          <p role="alert" className="text-meta font-medium text-danger">
            {errorText(result.message ?? "saveFailed")}
          </p>
        ) : null}
      </div>
      {canEdit ? (
        <div className="flex flex-wrap gap-2">
          <input
            ref={input}
            type="file"
            accept={PHOTO_FILES.accept}
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) upload(file);
            }}
          />
          <Button
            variant="outline"
            size="row"
            loading={pending}
            onClick={() => input.current?.click()}
          >
            <Upload aria-hidden />
            {employee.photo_path ? t("replacePhoto") : t("uploadPhoto")}
          </Button>
          {employee.photo_path ? (
            <Button
              variant="ghost"
              size="row"
              disabled={pending}
              onClick={() =>
                startTransition(async () =>
                  setResult(await removePhoto(employee.id)),
                )
              }
            >
              {t("removePhoto")}
            </Button>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}
