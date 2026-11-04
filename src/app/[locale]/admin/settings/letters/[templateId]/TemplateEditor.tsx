"use client";

import { useState, useTransition } from "react";
import { FileSearch } from "lucide-react";
import { useTranslations } from "next-intl";
import { FormFeedback, useFieldError } from "@/components/forms/FormFeedback";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/Card";
import { TextAreaField } from "@/components/ui/TextAreaField";
import { TextField } from "@/components/ui/TextField";
import { saveTemplate } from "@/lib/hiring/actions";
import { MERGE_FIELDS, unknownFields } from "@/lib/hiring/letters";
import type { LetterTemplate } from "@/lib/hiring/types";
import { idle } from "@/lib/settings/form";
import { createClient } from "@/lib/supabase/client";
import { useFormAction } from "@/lib/use-form-action";

// HIR-03 template editor: plain text with # headings, - bullets and {{merge fields}}.
// "Preview PDF" renders what is on screen (saved or not) with example values.
export function TemplateEditor({
  template,
  canEdit,
}: {
  template: LetterTemplate;
  canEdit: boolean;
}) {
  const t = useTranslations("Letters");
  const { state, onSubmit, pending } = useFormAction(saveTemplate, idle);
  const error = useFieldError(state);
  const [body, setBody] = useState(template.body);
  const [title, setTitle] = useState(template.title);
  const [isDraft, setIsDraft] = useState(template.is_draft);
  const [previewing, startPreview] = useTransition();
  const [previewFailed, setPreviewFailed] = useState(false);
  const unknown = unknownFields(body, template.kind);

  const preview = () =>
    startPreview(async () => {
      setPreviewFailed(false);
      const tab = window.open("", "_blank");
      const { data, error: invokeError } =
        await createClient().functions.invoke("hiring", {
          body: {
            action: "preview_template",
            kind: template.kind,
            locale: template.locale,
            title,
            body,
            is_draft: isDraft,
          },
        });
      if (invokeError || !(data instanceof Blob)) {
        tab?.close();
        setPreviewFailed(true);
        return;
      }
      const url = URL.createObjectURL(
        new Blob([data], { type: "application/pdf" }),
      );
      if (tab) tab.location.href = url;
      else window.location.href = url;
    });

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[2fr_1fr]">
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <input type="hidden" name="template_id" value={template.id} />
        <input type="hidden" name="kind" value={template.kind} />
        <Card className="flex flex-col gap-5">
          <fieldset disabled={!canEdit} className="flex flex-col gap-5">
            <TextField
              label={t("titleField")}
              name="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              hint={t("titleHint")}
              error={error("title")}
              required
            />
            <TextAreaField
              label={t("body")}
              name="body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={24}
              textareaClassName="font-mono text-meta leading-6"
              hint={t("bodyHint")}
              error={error("body")}
            />
            {unknown.length ? (
              <p role="alert" className="text-meta font-medium text-danger">
                {t("unknown", {
                  fields: unknown.map((f) => `{{${f}}}`).join(", "),
                })}
              </p>
            ) : null}
            <label className="flex cursor-pointer items-start gap-3 text-body text-ink">
              <input
                type="checkbox"
                name="is_draft"
                checked={isDraft}
                onChange={(e) => setIsDraft(e.target.checked)}
                className="mt-0.5 size-5 shrink-0 accent-primary"
              />
              <span className="flex flex-col gap-1">
                {t("isDraft")}
                <span className="text-meta text-ink-muted">
                  {t("isDraftHint")}
                </span>
              </span>
            </label>
          </fieldset>
        </Card>
        <div className="flex flex-wrap items-center gap-2">
          {canEdit ? (
            <Button type="submit" variant="accent" loading={pending}>
              {t("save")}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            loading={previewing}
            onClick={preview}
            disabled={!canEdit}
          >
            <FileSearch aria-hidden />
            {t("preview")}
          </Button>
        </div>
        {previewFailed ? (
          <p role="alert" className="text-meta font-medium text-danger">
            {t("previewFailed")}
          </p>
        ) : (
          <FormFeedback state={state} />
        )}
      </form>

      <Card className="flex flex-col gap-3 lg:sticky lg:top-24">
        <CardHeader title={t("fieldsTitle")} as="h3" />
        <p className="text-meta text-ink-muted">{t("fieldsIntro")}</p>
        <ul className="flex flex-col gap-2">
          {MERGE_FIELDS[template.kind].map((field) => (
            <li key={field} className="flex flex-col">
              <code className="text-meta font-medium text-primary-strong">{`{{${field}}}`}</code>
              <span className="text-meta text-ink-muted">
                {t(`fields.${field as "today"}`)}
              </span>
            </li>
          ))}
        </ul>
        <p className="text-meta text-ink-muted">{t("formatHelp")}</p>
      </Card>
    </div>
  );
}
