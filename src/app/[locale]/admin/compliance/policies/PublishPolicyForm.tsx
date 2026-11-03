"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";
import { Paperclip } from "lucide-react";
import { useTranslations } from "next-intl";
import { FormFeedback, useFieldError } from "@/components/forms/FormFeedback";
import {
  AudienceFields,
  type AudienceOption,
} from "@/components/policies/AudienceFields";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/Card";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import { useRouter } from "@/i18n/navigation";
import { storageFileName } from "@/lib/files";
import { publishPolicy } from "@/lib/policies/actions";
import {
  POLICY_PRESETS,
  policyCode,
  type Audience,
} from "@/lib/policies/logic";
import { idle, type FormState } from "@/lib/settings/form";
import { createClient } from "@/lib/supabase/client";

const MAX_BYTES = 10 * 1024 * 1024;

// POL-02: publish a policy or a new version. The PDF goes straight to the private
// `policies` bucket, then the server checks and fingerprints it and creates the version,
// which asks its audience to sign (again).
export function PublishPolicyForm({
  tenantId,
  branches,
  roles,
  existing,
  onDone,
}: {
  tenantId: string;
  branches: readonly AudienceOption[];
  roles: readonly AudienceOption[];
  /** Publishing a new version of this policy: code fixed, titles and audience prefilled. */
  existing?: {
    code: string;
    title_en: string;
    title_ms: string;
    audience: Audience;
    requires_signature: boolean;
  };
  onDone?: () => void;
}) {
  const t = useTranslations("Policies.publish");
  const router = useRouter();
  const chooser = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState(existing?.code ?? "PDPA_NOTICE");
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<FormState>(idle);
  const [pending, startTransition] = useTransition();
  const error = useFieldError(state);
  const pdpa = code === "PDPA_NOTICE";

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (!file)
      return setState({ status: "error", errors: { file: "required" } });
    if (file.type !== "application/pdf")
      return setState({ status: "error", errors: { file: "notPdf" } });
    if (file.size > MAX_BYTES)
      return setState({ status: "error", errors: { file: "tooLong" } });
    const finalCode =
      code === "OTHER"
        ? policyCode(String(data.get("code_other") ?? ""))
        : code;
    if (finalCode.length < 2)
      return setState({ status: "error", errors: { code_other: "required" } });

    startTransition(async () => {
      const path = `${tenantId}/${finalCode}/${storageFileName(file.name, "policy")}`;
      const { error: uploadError } = await createClient()
        .storage.from("policies")
        .upload(path, file, { contentType: "application/pdf", upsert: false });
      if (uploadError)
        return setState({ status: "error", message: "saveFailed" });
      data.set("file_path", path);
      const result = await publishPolicy(idle, data);
      setState(result);
      if (result.status === "saved") {
        onDone?.();
        if ("id" in result && result.id)
          router.push(`/admin/compliance/policies/${result.id}`);
        router.refresh();
      }
    });
  };

  return (
    <Card className="flex flex-col gap-5">
      <CardHeader title={existing ? t("newVersion") : t("title")} />
      <p className="-mt-3 max-w-3xl text-meta text-ink-muted">
        {existing ? t("newVersionIntro") : t("intro")}
      </p>
      <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
        {existing ? (
          <input type="hidden" name="code" value={existing.code} />
        ) : (
          <div className="grid gap-5 md:grid-cols-2">
            <SelectField
              label={t("code")}
              name="code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            >
              {POLICY_PRESETS.map((p) => (
                <option key={p} value={p}>
                  {t(`presets.${p}`)}
                </option>
              ))}
              <option value="OTHER">{t("presets.OTHER")}</option>
            </SelectField>
            {code === "OTHER" ? (
              <TextField
                label={t("code_other")}
                name="code_other"
                error={error("code_other")}
              />
            ) : null}
          </div>
        )}
        <div className="grid gap-5 md:grid-cols-2">
          <TextField
            label={t("title_en")}
            name="title_en"
            defaultValue={existing?.title_en ?? ""}
            error={error("title_en")}
          />
          <TextField
            label={t("title_ms")}
            name="title_ms"
            defaultValue={existing?.title_ms ?? ""}
            error={error("title_ms")}
          />
        </div>
        {pdpa ? (
          <p className="rounded-tile bg-primary-tint px-4 py-3 text-meta text-primary-strong">
            {t("pdpaNote")}
          </p>
        ) : (
          <>
            <AudienceFields
              branches={branches}
              roles={roles}
              initial={existing?.audience}
              error={error("audience_ids")}
            />
            <label className="flex min-h-11 items-center gap-3 text-body text-ink">
              <input
                type="checkbox"
                name="requires_signature"
                defaultChecked={existing?.requires_signature ?? true}
                className="size-5 accent-primary"
              />
              {t("requires_signature")}
            </label>
          </>
        )}
        <div className="flex flex-col gap-2">
          <span className="text-label text-ink">{t("file")}</span>
          <input
            ref={chooser}
            type="file"
            accept="application/pdf"
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              e.target.value = "";
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="row"
            className="w-fit"
            onClick={() => chooser.current?.click()}
          >
            <Paperclip aria-hidden />
            {file ? file.name : t("chooseFile")}
          </Button>
          <p
            className={
              error("file")
                ? "text-meta font-medium text-danger"
                : "text-meta text-ink-muted"
            }
          >
            {error("file") ?? t("fileHint")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="accent" loading={pending}>
            {existing ? t("publishVersion") : t("publish")}
          </Button>
          {onDone ? (
            <Button type="button" variant="ghost" onClick={onDone}>
              {t("cancel")}
            </Button>
          ) : null}
          {state.status === "error" && state.message ? (
            <FormFeedback state={state} />
          ) : null}
        </div>
      </form>
    </Card>
  );
}
