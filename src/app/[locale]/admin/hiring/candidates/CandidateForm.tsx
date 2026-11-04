"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";
import { FileText, Paperclip } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { FormFeedback, useFieldError } from "@/components/forms/FormFeedback";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/Card";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import { displayFileName, storageFileName } from "@/lib/files";
import { saveCandidate } from "@/lib/hiring/actions";
import type { Candidate } from "@/lib/hiring/types";
import { idle, type FormState } from "@/lib/settings/form";
import { createClient } from "@/lib/supabase/client";
import { OpenFileButton } from "./OpenFileButton";

const CV_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];
const CV_MAX = 10 * 1024 * 1024;

// HIR-02 add / edit a candidate. The CV goes from the browser straight to the private
// `candidates` bucket (Storage rules: owner / HR of this company), then the form is saved.
export function CandidateForm({
  tenantId,
  openings,
  candidate,
  initialOpeningId,
  canEdit,
}: {
  tenantId: string;
  openings: readonly { id: string; title: string }[];
  candidate?: Candidate;
  initialOpeningId?: string;
  canEdit: boolean;
}) {
  const t = useTranslations("Hiring.candidate");
  const locale = useLocale();
  const [state, setState] = useState<FormState>(idle);
  const [file, setFile] = useState<File | null>(null);
  const [problem, setProblem] = useState<
    "cvType" | "cvTooBig" | "uploadFailed" | null
  >(null);
  const [pending, startTransition] = useTransition();
  const chooser = useRef<HTMLInputElement>(null);
  const error = useFieldError(state);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setProblem(null);
    startTransition(async () => {
      if (file) {
        const path = `${tenantId}/${crypto.randomUUID()}/${storageFileName(file.name, "cv")}`;
        const { error: uploadError } = await createClient()
          .storage.from("candidates")
          .upload(path, file, { contentType: file.type, upsert: false });
        if (uploadError) {
          setProblem("uploadFailed");
          return;
        }
        data.set("cv_path", path);
      }
      const result = await saveCandidate(idle, data);
      setState(result);
      if (result.status === "saved") setFile(null);
    });
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="locale" value={locale} />
      {candidate ? (
        <input type="hidden" name="candidate_id" value={candidate.id} />
      ) : null}
      <Card className="flex flex-col gap-5">
        <fieldset disabled={!canEdit} className="grid gap-5 md:grid-cols-2">
          <TextField
            className="md:col-span-2"
            label={t("full_name")}
            name="full_name"
            defaultValue={candidate?.full_name ?? ""}
            hint={t("full_nameHint")}
            error={error("full_name")}
            autoComplete="off"
            required
          />
          <TextField
            type="email"
            label={t("email")}
            name="email"
            defaultValue={candidate?.email ?? ""}
            hint={t("emailHint")}
            error={error("email")}
            autoComplete="off"
            required
          />
          <TextField
            type="tel"
            label={t("phone")}
            name="phone"
            defaultValue={candidate?.phone ?? ""}
            error={error("phone")}
            autoComplete="off"
          />
          <SelectField
            label={t("job_opening_id")}
            name="job_opening_id"
            defaultValue={candidate?.job_opening_id ?? initialOpeningId ?? ""}
            error={error("job_opening_id")}
          >
            <option value="">{t("choose")}</option>
            {openings.map((o) => (
              <option key={o.id} value={o.id}>
                {o.title}
              </option>
            ))}
          </SelectField>
          <TextField
            label={t("notes")}
            name="notes"
            defaultValue={candidate?.notes ?? ""}
            error={error("notes")}
          />
        </fieldset>

        <div className="flex flex-col gap-2">
          <p className="text-label text-ink">{t("cv")}</p>
          <p className="text-meta text-ink-muted">{t("cvHint")}</p>
          <input
            ref={chooser}
            type="file"
            accept={CV_TYPES.join(",")}
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(e) => {
              const picked = e.target.files?.[0] ?? null;
              e.target.value = "";
              if (!picked) return;
              if (!CV_TYPES.includes(picked.type)) return setProblem("cvType");
              if (picked.size > CV_MAX) return setProblem("cvTooBig");
              setProblem(null);
              setFile(picked);
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            {candidate?.cv_path && !file ? (
              <OpenFileButton kind="cv" id={candidate.id} label={t("openCv")} />
            ) : null}
            {canEdit ? (
              <Button
                type="button"
                variant="outline"
                size="row"
                onClick={() => chooser.current?.click()}
              >
                <Paperclip aria-hidden />
                {candidate?.cv_path || file ? t("replaceCv") : t("chooseCv")}
              </Button>
            ) : null}
          </div>
          {file ? (
            <p className="flex items-center gap-2 text-body text-ink">
              <FileText
                aria-hidden
                size={18}
                strokeWidth={1.75}
                className="text-primary"
              />
              {file.name}
            </p>
          ) : candidate?.cv_path ? (
            <p className="text-meta text-ink-muted">
              {displayFileName(candidate.cv_path)}
            </p>
          ) : (
            <p className="text-meta text-ink-muted">{t("noCv")}</p>
          )}
          {problem ? (
            <p role="alert" className="text-meta font-medium text-danger">
              {t(`problems.${problem}`)}
            </p>
          ) : null}
        </div>
      </Card>
      {canEdit ? (
        <div className="flex flex-col items-start gap-3">
          <Button
            type="submit"
            variant={candidate ? "primary" : "accent"}
            loading={pending}
          >
            {candidate ? t("save") : t("create")}
          </Button>
          <FormFeedback state={state} />
        </div>
      ) : null}
    </form>
  );
}
