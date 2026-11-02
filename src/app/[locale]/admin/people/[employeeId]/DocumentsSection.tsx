"use client";

import { useRef, useState, useTransition } from "react";
import { FileText, Upload } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useErrorText } from "@/components/forms/FormFeedback";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import { displayFileName } from "@/lib/files";
import { dateFromIso, formatDate, malaysiaToday } from "@/lib/format";
import {
  DOC_TYPES,
  DOCUMENT_FILES,
  documentFileProblem,
  documentPath,
  type DocType,
  type EmployeeDocument,
} from "@/lib/people/records";
import type { FormState } from "@/lib/settings/form";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { attachDocument, documentUrl, removeDocument } from "../actions";

type Problem =
  "noFile" | "fileType" | "fileTooBig" | "uploadFailed" | "openFailed";

// Documents tab (EMP-06). Files live in the private `documents` bucket and open only
// through 5-minute signed links. Optional expiry dates are shown on each row.
export function DocumentsSection({
  employeeId,
  tenantId,
  documents,
  canEdit,
}: {
  employeeId: string;
  tenantId: string;
  documents: readonly EmployeeDocument[];
  canEdit: boolean;
}) {
  const t = useTranslations("People.documents");
  const locale = useLocale();
  const errorText = useErrorText();
  const today = malaysiaToday();
  const form = useRef<HTMLFormElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [pending, startTransition] = useTransition();
  const [problem, setProblem] = useState<Problem | null>(null);
  const [result, setResult] = useState<FormState | null>(null);
  const day = (iso: string) => formatDate(dateFromIso(iso), locale, "full");

  const upload = (data: FormData) => {
    setResult(null);
    if (!file) return setProblem("noFile");
    const issue = documentFileProblem(file);
    setProblem(issue);
    if (issue) return;
    const docType = String(data.get("doc_type") ?? "other") as DocType;
    const values = {
      doc_type: docType,
      title: String(data.get("title") ?? ""),
      expiry_date: String(data.get("expiry_date") ?? ""),
    };
    startTransition(async () => {
      const path = documentPath(tenantId, employeeId, docType, file.name);
      const { error } = await createClient()
        .storage.from("documents")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (error) return setProblem("uploadFailed");
      const saved = await attachDocument(employeeId, path, values, {
        mime: file.type,
        size: file.size,
      });
      setResult(saved);
      if (saved.status === "saved") {
        form.current?.reset();
        setFile(null);
      }
    });
  };

  const view = (id: string) => {
    setProblem(null);
    // Open the tab inside the click so pop-up blockers allow it; fill it once the link is ready.
    const tab = window.open("", "_blank");
    startTransition(async () => {
      const res = await documentUrl(id);
      if ("url" in res && tab) {
        tab.opener = null;
        tab.location.href = res.url;
      } else {
        tab?.close();
        setProblem("openFailed");
      }
    });
  };

  const message =
    problem !== null
      ? t(`problems.${problem}`)
      : result?.status === "error"
        ? errorText(result.message ?? "invalidChoice")
        : null;

  return (
    <>
      <Card className="flex flex-col gap-4">
        <CardHeader title={t("title")} />
        <p className="-mt-2 text-meta text-ink-muted">{t("intro")}</p>
        {documents.length === 0 ? (
          <EmptyState message={t("none")} className="py-2" />
        ) : (
          <ul className="divide-y divide-border">
            {documents.map((d) => {
              const expired = d.expiry_date !== null && d.expiry_date < today;
              return (
                <li
                  key={d.id}
                  className="flex flex-col gap-3 py-3 md:flex-row md:items-center md:gap-4"
                >
                  <span
                    aria-hidden
                    className={cn(
                      "hidden size-12 shrink-0 place-items-center rounded-control md:grid",
                      expired
                        ? "bg-danger-tint text-danger"
                        : "bg-primary-tint text-primary",
                    )}
                  >
                    <FileText size={24} strokeWidth={1.75} />
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <p className="text-h3 text-ink">
                      {d.title ?? t(`docTypes.${d.doc_type}`)}
                    </p>
                    <p
                      className={cn(
                        "text-meta",
                        expired ? "font-medium text-danger" : "text-ink-muted",
                      )}
                    >
                      {[
                        d.title ? t(`docTypes.${d.doc_type}`) : null,
                        displayFileName(d.file_path),
                        d.expiry_date
                          ? expired
                            ? t("expired", { date: day(d.expiry_date) })
                            : t("expires", { date: day(d.expiry_date) })
                          : null,
                        t("added", {
                          date: formatDate(
                            new Date(d.created_at),
                            locale,
                            "full",
                          ),
                        }),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="row"
                      disabled={pending}
                      onClick={() => view(d.id)}
                    >
                      {t("view")}
                    </Button>
                    {canEdit ? (
                      <Button
                        variant="ghost"
                        size="row"
                        disabled={pending}
                        onClick={() => {
                          if (window.confirm(t("removeConfirm")))
                            startTransition(async () =>
                              setResult(await removeDocument(d.id)),
                            );
                        }}
                      >
                        {t("remove")}
                      </Button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {message && !canEdit ? (
          <p role="alert" className="text-meta font-medium text-danger">
            {message}
          </p>
        ) : null}
      </Card>

      {canEdit ? (
        <Card className="flex flex-col gap-5">
          <CardHeader title={t("upload")} as="h3" />
          <form
            ref={form}
            onSubmit={(e) => {
              e.preventDefault();
              upload(new FormData(e.currentTarget));
            }}
            className="flex flex-col gap-5"
            noValidate
          >
            <div className="grid gap-5 md:grid-cols-3">
              <SelectField
                label={t("doc_type")}
                name="doc_type"
                defaultValue="contract"
              >
                {DOC_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {t(`docTypes.${type}`)}
                  </option>
                ))}
              </SelectField>
              <TextField label={t("titleField")} name="title" />
              <TextField
                type="date"
                label={t("expiry_date")}
                name="expiry_date"
              />
            </div>
            <TextField
              type="file"
              label={t("file")}
              accept={DOCUMENT_FILES.accept}
              hint={t("fileHint")}
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setProblem(null);
              }}
              className="[&_input]:pt-2.5"
            />
            <div className="flex flex-col items-start gap-3 md:flex-row md:items-center">
              <Button type="submit" variant="accent" loading={pending}>
                <Upload aria-hidden />
                {t("upload")}
              </Button>
              {message ? (
                <p role="alert" className="text-meta font-medium text-danger">
                  {message}
                </p>
              ) : null}
            </div>
          </form>
        </Card>
      ) : null}
    </>
  );
}
