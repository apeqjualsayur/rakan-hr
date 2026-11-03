"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";
import { Camera, FileText, Paperclip, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { FormFeedback, useFieldError } from "@/components/forms/FormFeedback";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/Card";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import { Link, useRouter } from "@/i18n/navigation";
import {
  saveCredential,
  submitCredential,
  type DraftState,
} from "@/lib/credentials/actions";
import { suggestExpiry, typeName } from "@/lib/credentials/logic";
import type { CredentialType, StaffCredential } from "@/lib/credentials/types";
import {
  CREDENTIAL_FILES,
  fileProblem,
  uploadCredentialFile,
  type UploadProblem,
} from "@/lib/credentials/upload";
import { formatDate } from "@/lib/format";
import { idle } from "@/lib/settings/form";

type Problem = UploadProblem | "noFiles";

// CRD-05 add / renew, CRD-08 edit while pending, CRD-10 HR on someone's behalf.
// Saving takes three steps: a draft is saved, each file goes through the upload Edge
// Function, then the draft is submitted (→ Pending, or Verified for types that need no check).
// A failed upload keeps the draft, so pressing the button again retries only what is left.
export function CredentialForm({
  types,
  employeeId,
  initialTypeId,
  renewOf,
  existing,
  doneHref,
  cancelHref,
}: {
  types: readonly CredentialType[];
  /** Set when HR adds for someone else. */
  employeeId?: string;
  initialTypeId?: string;
  renewOf?: {
    id: string;
    verified_at: string | null;
    reference_no: string | null;
  };
  /** Editing a draft / pending record. */
  existing?: StaffCredential;
  doneHref: string;
  cancelHref: string;
}) {
  const t = useTranslations("Credentials.form");
  const locale = useLocale();
  const router = useRouter();
  const [typeId, setTypeId] = useState(
    existing?.credential_type_id ?? initialTypeId ?? "",
  );
  const [effective, setEffective] = useState(existing?.effective_date ?? "");
  const [expiry, setExpiry] = useState(existing?.expiry_date ?? "");
  const [files, setFiles] = useState<File[]>([]);
  const [state, setState] = useState<DraftState>(idle);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [progress, setProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [draftId, setDraftId] = useState<string | null>(existing?.id ?? null);
  const [pending, startTransition] = useTransition();
  const chooser = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const error = useFieldError(state.status === "draft" ? idle : state);

  const type = types.find((x) => x.id === typeId) ?? null;
  const editing = Boolean(existing);

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const picked = [...list];
    const issue = picked.map(fileProblem).find(Boolean) ?? null;
    setProblem(issue);
    if (!issue) setFiles((current) => [...current, ...picked]);
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setProblem(null);
    if (!editing && type?.requires_verification && files.length === 0) {
      setProblem("noFiles");
      return;
    }
    startTransition(async () => {
      if (draftId) data.set("credential_id", draftId);
      const saved = await saveCredential(idle, data);
      setState(saved);
      if (saved.status !== "draft") return;
      setDraftId(saved.id);

      // Upload what's left; keep the ones that failed for another try.
      const left: File[] = [];
      for (const [index, file] of files.entries()) {
        setProgress({ done: index, total: files.length });
        const failed = await uploadCredentialFile("credential", saved.id, file);
        if (failed) {
          setProblem(failed);
          left.push(file);
        }
      }
      setProgress(null);
      setFiles(left);
      if (left.length) return;

      if (!editing) {
        const submitted = await submitCredential(saved.id);
        if (submitted.status === "error") {
          setState(submitted);
          return;
        }
      }
      router.push(doneHref);
      router.refresh();
    });
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      {employeeId ? (
        <input type="hidden" name="employee_id" value={employeeId} />
      ) : null}
      {renewOf ? (
        <input type="hidden" name="previous_id" value={renewOf.id} />
      ) : null}

      <Card className="flex flex-col gap-5">
        {editing ? (
          <input type="hidden" name="credential_type_id" value={typeId} />
        ) : (
          <SelectField
            label={t("type")}
            name="credential_type_id"
            value={typeId}
            onChange={(e) => setTypeId(e.target.value)}
            error={error("credential_type_id")}
            disabled={Boolean(renewOf)}
          >
            <option value="">{t("choose")}</option>
            {types.map((x) => (
              <option key={x.id} value={x.id}>
                {typeName(x, locale)}
              </option>
            ))}
          </SelectField>
        )}
        {renewOf ? (
          <input type="hidden" name="credential_type_id" value={typeId} />
        ) : null}
        {renewOf?.verified_at ? (
          <p className="-mt-2 text-meta text-ink-muted">
            {t("renewsNote", {
              date: formatDate(new Date(renewOf.verified_at), locale, "full"),
            })}
          </p>
        ) : null}
        {type?.restricted ? (
          <p className="-mt-2 rounded-tile bg-neutral-tint px-4 py-3 text-meta text-neutral">
            {t("restrictedNote")}
          </p>
        ) : null}

        <TextField
          label={t("reference_no")}
          name="reference_no"
          defaultValue={existing?.reference_no ?? ""}
          error={error("reference_no")}
          autoComplete="off"
        />
        <TextField
          key={`issuer-${typeId}`}
          label={t("issuing_body")}
          name="issuing_body"
          defaultValue={existing?.issuing_body ?? type?.issuing_body ?? ""}
          error={error("issuing_body")}
        />
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField
            type="date"
            label={t("effective_date")}
            name="effective_date"
            value={effective}
            onChange={(e) => {
              setEffective(e.target.value);
              if (!expiry && type)
                setExpiry(
                  suggestExpiry(e.target.value, type.default_validity_months),
                );
            }}
            hint={t("effectiveHint")}
            error={error("effective_date")}
            required
          />
          {type && !type.has_expiry ? (
            <p className="self-center text-meta text-ink-muted">
              {t("noExpiry")}
            </p>
          ) : (
            <TextField
              type="date"
              label={t("expiry_date")}
              name="expiry_date"
              value={expiry}
              min={effective || undefined}
              onChange={(e) => setExpiry(e.target.value)}
              error={error("expiry_date")}
              required
            />
          )}
        </div>
        {type?.tracks_cpd ? (
          <TextField
            label={t("cpd_points")}
            name="cpd_points"
            inputMode="decimal"
            defaultValue={existing?.cpd_points ?? ""}
            error={error("cpd_points")}
          />
        ) : null}
        <TextField
          label={t("notes")}
          name="notes"
          defaultValue={existing?.notes ?? ""}
          error={error("notes")}
        />
      </Card>

      <Card className="flex flex-col gap-3">
        <p className="text-label text-ink">{t("files")}</p>
        <p className="-mt-2 text-meta text-ink-muted">{t("filesHint")}</p>
        <input
          ref={camera}
          type="file"
          accept="image/jpeg,image/png"
          capture="environment"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <input
          ref={chooser}
          type="file"
          accept={CREDENTIAL_FILES.accept}
          multiple
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="row"
            onClick={() => camera.current?.click()}
          >
            <Camera aria-hidden />
            {t("takePhoto")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="row"
            onClick={() => chooser.current?.click()}
          >
            <Paperclip aria-hidden />
            {t("chooseFiles")}
          </Button>
        </div>
        {files.length ? (
          <ul className="flex flex-col divide-y divide-border">
            {files.map((file, index) => (
              <li
                key={`${file.name}-${index}`}
                className="flex items-center gap-3 py-2"
              >
                <FileText
                  aria-hidden
                  size={20}
                  strokeWidth={1.75}
                  className="shrink-0 text-primary"
                />
                <span className="min-w-0 flex-1 truncate text-body text-ink">
                  {file.name}
                </span>
                <span className="text-meta text-ink-muted tabular-nums">
                  {(file.size / 1024 / 1024).toFixed(1)} MB
                </span>
                <button
                  type="button"
                  aria-label={`${t("remove")} ${file.name}`}
                  onClick={() =>
                    setFiles((current) => current.filter((_, i) => i !== index))
                  }
                  className="grid size-11 place-items-center rounded-full text-ink-soft hover:bg-canvas"
                >
                  <X aria-hidden size={18} strokeWidth={1.75} />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </Card>

      <div className="flex flex-col gap-3">
        <Button type="submit" variant="accent" loading={pending} block>
          {editing ? t("saveChanges") : t("submit")}
        </Button>
        <Link
          href={cancelHref}
          className="flex min-h-11 items-center justify-center text-label text-ink-soft underline-offset-4 hover:underline"
        >
          {t("cancel")}
        </Link>
        {progress ? (
          <p role="status" className="text-meta text-ink-muted">
            {t("uploading", { done: progress.done + 1, total: progress.total })}
          </p>
        ) : null}
        {problem ? (
          <p role="alert" className="text-meta font-medium text-danger">
            {t(`problems.${problem}`)}
          </p>
        ) : state.status === "error" ? (
          <FormFeedback state={state} />
        ) : null}
      </div>
    </form>
  );
}
