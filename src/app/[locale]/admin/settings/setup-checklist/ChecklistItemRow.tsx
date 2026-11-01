"use client";

import { useRef, useState, useTransition } from "react";
import { FileCheck2, Paperclip, Upload } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/SelectField";
import { StatusChip } from "@/components/ui/StatusChip";
import { Link } from "@/i18n/navigation";
import { dateFromIso, formatDate } from "@/lib/format";
import {
  CHECKLIST_STATUSES,
  describeRule,
  displayStatus,
  evidenceFileName,
  evidencePath,
  evidenceProblem,
  EVIDENCE,
  isChecklistCode,
  UNVERIFIED_DEADLINES,
  type ChecklistItem,
} from "@/lib/settings/checklist";
import type { FormState } from "@/lib/settings/form";
import { createClient } from "@/lib/supabase/client";
import { toneTileClasses, statusTone } from "@/lib/status-styles";
import { cn } from "@/lib/utils";
import { useErrorText } from "../_components/FormFeedback";
import {
  attachEvidence,
  evidenceUrl,
  removeEvidence,
  setChecklistDueDate,
  setChecklistStatus,
} from "./actions";

type Problem = "fileType" | "fileTooBig" | "uploadFailed" | "openFailed";

// One ORG-04 item: what it is and why · due date and its rule · evidence · status.
export function ChecklistItemRow({
  item,
  today,
  tenantId,
  hasFirstHire,
  hasFirstPayday,
  canEdit,
  canEditDates,
}: {
  item: ChecklistItem;
  today: string;
  tenantId: string;
  hasFirstHire: boolean;
  hasFirstPayday: boolean;
  canEdit: boolean;
  /** Can change the company's first hire / payday dates (link to the Company page). */
  canEditDates: boolean;
}) {
  const t = useTranslations("Settings.checklist");
  const ts = useTranslations("Status.checklist");
  const errorText = useErrorText();
  const locale = useLocale();
  const fileInput = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [problem, setProblem] = useState<Problem | null>(null);
  const [result, setResult] = useState<FormState | null>(null);

  const code = isChecklistCode(item.code) ? item.code : null;
  const title = code ? t(`items.${code}.title`) : item.title;
  const shown = displayStatus(item, today);
  const rule = describeRule(item.due_rule);
  const anchorMissing =
    rule && (rule.anchor === "first_hire" ? !hasFirstHire : !hasFirstPayday);
  const day = (iso: string) => formatDate(dateFromIso(iso), locale, "full");

  const ruleText = !rule
    ? null
    : rule.anchor === "first_hire"
      ? rule.days === 0
        ? t("ruleHireOn")
        : t("ruleHireAfter", { days: rule.days })
      : rule.days === 0
        ? t("rulePaydayOn")
        : t("rulePaydayBefore", { days: Math.abs(rule.days) });

  const act = (action: () => Promise<FormState>) => {
    setProblem(null);
    startTransition(async () => setResult(await action()));
  };

  const upload = (file: File) => {
    const issue = evidenceProblem(file);
    setProblem(issue);
    setResult(null);
    if (issue) return;
    startTransition(async () => {
      const path = evidencePath(tenantId, item.id, file.name);
      const { error } = await createClient()
        .storage.from("company")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (error) {
        setProblem("uploadFailed");
        return;
      }
      setResult(await attachEvidence(item.id, path));
    });
  };

  const view = () => {
    setProblem(null);
    // Open the tab now (inside the click) so pop-up blockers allow it; fill it once
    // the short-lived signed link is ready.
    const tab = window.open("", "_blank");
    startTransition(async () => {
      const res = await evidenceUrl(item.id);
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
        ? errorText(result.message ?? "saveFailed")
        : null;

  return (
    <li className="flex flex-col gap-4 py-5 first:pt-0 last:pb-0 md:flex-row md:gap-6">
      <span
        aria-hidden
        className={cn(
          "grid size-12 shrink-0 place-items-center rounded-control",
          toneTileClasses[statusTone("checklist", shown)],
        )}
      >
        <FileCheck2 size={24} strokeWidth={1.75} />
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <h3 className="text-h3 text-ink">{title}</h3>
          <StatusChip domain="checklist" status={shown} />
        </div>
        {code ? (
          <p className="text-meta text-ink-muted">{t(`items.${code}.why`)}</p>
        ) : null}

        <p
          className={cn(
            "text-meta",
            shown === "overdue" ? "font-medium text-danger" : "text-ink-soft",
          )}
        >
          {[
            item.status === "done" && item.completed_at
              ? t("completed", {
                  date: formatDate(new Date(item.completed_at), locale, "full"),
                })
              : item.due_date
                ? t("due", { date: day(item.due_date) })
                : rule
                  ? null
                  : t("noDue"),
            ruleText,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {anchorMissing ? (
          <p className="text-meta text-warning">
            {rule?.anchor === "first_hire"
              ? t("needsFirstHire")
              : t("needsFirstPayday")}{" "}
            {canEditDates ? (
              <Link
                href="/admin/settings/company"
                className="font-semibold text-primary underline-offset-4 hover:underline"
              >
                {t("companyPage")}
              </Link>
            ) : null}
          </p>
        ) : null}
        {code && UNVERIFIED_DEADLINES.includes(code) ? (
          <p className="text-meta text-ink-muted">{t("verifyDeadline")}</p>
        ) : null}

        <p className="flex items-center gap-1.5 text-meta text-ink-muted">
          <Paperclip aria-hidden size={16} strokeWidth={1.75} />
          {item.evidence_file_path
            ? evidenceFileName(item.evidence_file_path)
            : t("noEvidence")}
        </p>

        <div className="mt-1 flex flex-wrap items-center gap-2">
          {item.evidence_file_path ? (
            <Button
              variant="outline"
              size="row"
              onClick={view}
              disabled={pending}
            >
              {t("view")}
            </Button>
          ) : null}
          {canEdit ? (
            <>
              <input
                ref={fileInput}
                type="file"
                accept={EVIDENCE.accept}
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
                onClick={() => fileInput.current?.click()}
              >
                <Upload aria-hidden />
                {item.evidence_file_path ? t("replace") : t("upload")}
              </Button>
              {item.evidence_file_path ? (
                <Button
                  variant="ghost"
                  size="row"
                  disabled={pending}
                  onClick={() => {
                    if (window.confirm(t("removeConfirm")))
                      act(() => removeEvidence(item.id));
                  }}
                >
                  {t("removeEvidence")}
                </Button>
              ) : null}
            </>
          ) : null}
        </div>
        {canEdit ? (
          <p className="text-meta text-ink-muted">{t("evidenceHint")}</p>
        ) : null}
        {message ? (
          <p role="alert" className="text-meta font-medium text-danger">
            {message}
          </p>
        ) : null}
      </div>

      {canEdit ? (
        <div className="flex flex-col gap-3 md:w-56 md:shrink-0">
          <label className="flex flex-col gap-2 text-label text-ink">
            {t("status")}
            <Select
              value={item.status}
              disabled={pending}
              onChange={(e) =>
                act(() => setChecklistStatus(item.id, e.target.value))
              }
            >
              {CHECKLIST_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {ts(s)}
                </option>
              ))}
            </Select>
          </label>
          {rule ? null : (
            <label className="flex flex-col gap-2 text-label text-ink">
              {t("dueDate")}
              <Input
                type="date"
                defaultValue={item.due_date ?? ""}
                disabled={pending}
                onChange={(e) => {
                  const value = e.target.value;
                  // Save complete dates (or a cleared field), not every keystroke.
                  if (value === "" || /^\d{4}-\d{2}-\d{2}$/.test(value))
                    act(() => setChecklistDueDate(item.id, value));
                }}
              />
            </label>
          )}
        </div>
      ) : null}
    </li>
  );
}
