"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";
import { Paperclip, Plus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import {
  FormFeedback,
  useErrorText,
  useFieldError,
} from "@/components/forms/FormFeedback";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { SelectField } from "@/components/ui/SelectField";
import { StatusChip } from "@/components/ui/StatusChip";
import { TextField } from "@/components/ui/TextField";
import { useRouter } from "@/i18n/navigation";
import {
  cpdFileUrl,
  cpdSaved,
  saveCpd,
  withdrawCpd,
  type DraftState,
} from "@/lib/credentials/actions";
import { typeName } from "@/lib/credentials/logic";
import {
  CPD_CATEGORIES,
  type CpdActivity,
  type CpdProgress,
} from "@/lib/credentials/types";
import {
  CREDENTIAL_FILES,
  fileProblem,
  uploadCredentialFile,
  type UploadProblem,
} from "@/lib/credentials/upload";
import { dateFromIso, formatDate, malaysiaToday } from "@/lib/format";
import { idle, type FormState } from "@/lib/settings/form";

type CpdType = { id: string; name_en: string; name_ms: string };

// CRD-18 / CRD-19: progress toward each CPD target for the current cycle, the activity log,
// and logging a new activity with an optional certificate (verified by HR).
export function CpdSection({
  progress,
  activities,
  types,
  employeeId,
}: {
  progress: readonly CpdProgress[];
  activities: readonly CpdActivity[];
  types: readonly CpdType[];
  /** Set when HR logs for someone else. */
  employeeId?: string;
}) {
  const t = useTranslations("Credentials.cpd");
  const tc = useTranslations("Credentials.form");
  const locale = useLocale();
  const errorText = useErrorText();
  const router = useRouter();
  const [logging, setLogging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<DraftState>(idle);
  const [problem, setProblem] = useState<UploadProblem | null>(null);
  const [pending, startTransition] = useTransition();
  const [rowResult, setRowResult] = useState<FormState | null>(null);
  const chooser = useRef<HTMLInputElement>(null);
  const error = useFieldError(state.status === "draft" ? idle : state);
  const day = (iso: string | null) =>
    iso ? formatDate(dateFromIso(iso), locale, "full") : "";
  const nameOf = (id: string) => {
    const type = types.find((x) => x.id === id);
    return type ? typeName(type, locale) : "";
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (employeeId) data.set("employee_id", employeeId);
    setProblem(null);
    startTransition(async () => {
      if (state.status === "draft") data.set("activity_id", state.id);
      const saved = await saveCpd(idle, data);
      setState(saved);
      if (saved.status !== "draft") return;
      if (file) {
        const failed = await uploadCredentialFile("cpd", saved.id, file);
        if (failed) {
          setProblem(failed);
          return;
        }
      }
      await cpdSaved();
      setLogging(false);
      setFile(null);
      setState(idle);
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-meta text-ink-muted">{t("intro")}</p>
      {progress.length === 0 ? (
        <Card>
          <EmptyState message={t("noTypes")} />
        </Card>
      ) : (
        progress.map((p) => {
          const points = Number(p.points_verified);
          const required = p.points_required ? Number(p.points_required) : null;
          return (
            <Card key={p.credential_type_id} className="flex flex-col gap-3">
              <CardHeader title={typeName(p, locale)} as="h2" />
              {required ? (
                <ProgressBar
                  value={Math.min(points, required)}
                  max={required}
                  label={t("progress", { points, required })}
                  valueLabel={
                    p.on_track === false
                      ? t("behind", { target: p.target_to_date ?? 0 })
                      : t("onTrack")
                  }
                />
              ) : (
                <p className="text-body text-ink">
                  {t("progressNoTarget", { points })}
                  <span className="block text-meta text-ink-muted">
                    {t("noTarget")}
                  </span>
                </p>
              )}
              <p className="text-meta text-ink-muted">
                {[
                  p.cycle_start && p.cycle_end
                    ? t("cycle", {
                        start: day(p.cycle_start),
                        end: day(p.cycle_end),
                      })
                    : t("noCycle"),
                  Number(p.points_pending) > 0
                    ? t("pendingPoints", { points: Number(p.points_pending) })
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </Card>
          );
        })
      )}

      {types.length ? (
        <Card className="flex flex-col gap-3">
          <CardHeader
            title={t("activities")}
            as="h2"
            action={
              logging ? null : (
                <Button variant="link" onClick={() => setLogging(true)}>
                  <Plus aria-hidden />
                  {t("log")}
                </Button>
              )
            }
          />
          {logging ? (
            <form
              onSubmit={onSubmit}
              className="flex flex-col gap-4 rounded-tile border border-border bg-canvas p-4"
              noValidate
            >
              <SelectField
                label={t("credential_type_id")}
                name="credential_type_id"
                defaultValue={types[0]?.id}
                error={error("credential_type_id")}
              >
                {types.map((x) => (
                  <option key={x.id} value={x.id}>
                    {typeName(x, locale)}
                  </option>
                ))}
              </SelectField>
              <TextField
                label={t("title")}
                name="title"
                error={error("title")}
              />
              <TextField
                label={t("provider")}
                name="provider"
                error={error("provider")}
              />
              <div className="grid grid-cols-2 gap-4">
                <TextField
                  type="date"
                  label={t("activity_date")}
                  name="activity_date"
                  max={malaysiaToday()}
                  error={error("activity_date")}
                />
                <SelectField
                  label={t("category")}
                  name="category"
                  defaultValue="course"
                >
                  {CPD_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {t(`categories.${c}`)}
                    </option>
                  ))}
                </SelectField>
                <TextField
                  label={t("points")}
                  name="points"
                  inputMode="decimal"
                  error={error("points")}
                />
                <TextField
                  label={t("hours")}
                  name="hours"
                  inputMode="decimal"
                  error={error("hours")}
                />
              </div>
              <div className="flex flex-col gap-2">
                <span className="text-label text-ink">{t("certificate")}</span>
                <input
                  ref={chooser}
                  type="file"
                  accept={CREDENTIAL_FILES.accept}
                  className="sr-only"
                  tabIndex={-1}
                  aria-hidden
                  onChange={(e) => {
                    const picked = e.target.files?.[0] ?? null;
                    e.target.value = "";
                    const issue = picked ? fileProblem(picked) : null;
                    setProblem(issue);
                    if (!issue) setFile(picked);
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
                  {file ? file.name : tc("chooseFiles")}
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="submit" loading={pending}>
                  {t("save")}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setLogging(false)}
                >
                  {t("cancel")}
                </Button>
              </div>
              {problem ? (
                <p role="alert" className="text-meta font-medium text-danger">
                  {tc(`problems.${problem}`)}
                </p>
              ) : state.status === "error" ? (
                <FormFeedback state={state} />
              ) : null}
            </form>
          ) : null}

          {activities.length === 0 ? (
            <EmptyState message={t("none")} className="py-2" />
          ) : (
            <ul className="divide-y divide-border">
              {activities.map((a) => (
                <li key={a.id} className="flex flex-col gap-2 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-h3 text-ink">{a.title}</p>
                      <p className="text-meta text-ink-muted">
                        {[
                          day(a.activity_date),
                          t(`categories.${a.category}`),
                          t("pointsMeta", { points: Number(a.points) }),
                          nameOf(a.credential_type_id),
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      {a.status === "rejected" && a.reject_reason ? (
                        <p className="text-meta text-danger">
                          {t("rejected", { reason: a.reject_reason })}
                        </p>
                      ) : null}
                    </div>
                    <StatusChip domain="cpd" status={a.status} />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {a.file_path ? (
                      <Button
                        variant="outline"
                        size="row"
                        onClick={() => {
                          const tab = window.open("", "_blank");
                          startTransition(async () => {
                            const res = await cpdFileUrl(a.id);
                            if ("url" in res && tab) {
                              tab.opener = null;
                              tab.location.href = res.url;
                            } else tab?.close();
                          });
                        }}
                      >
                        {t("viewFile")}
                      </Button>
                    ) : null}
                    {a.status === "pending" ? (
                      <Button
                        variant="ghost"
                        size="row"
                        disabled={pending}
                        onClick={() => {
                          if (window.confirm(t("withdrawConfirm")))
                            startTransition(async () =>
                              setRowResult(await withdrawCpd(a.id)),
                            );
                        }}
                      >
                        {t("withdraw")}
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {rowResult?.status === "error" ? (
            <p role="alert" className="text-meta font-medium text-danger">
              {errorText(rowResult.message ?? "saveFailed")}
            </p>
          ) : null}
        </Card>
      ) : null}
    </div>
  );
}
