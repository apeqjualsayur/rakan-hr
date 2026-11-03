"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Pin, Plus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import {
  FormFeedback,
  useErrorText,
  useFieldError,
} from "@/components/forms/FormFeedback";
import {
  AudienceFields,
  type AudienceOption,
} from "@/components/policies/AudienceFields";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { TextField } from "@/components/ui/TextField";
import { formatDate, formatTime } from "@/lib/format";
import {
  deleteAnnouncement,
  saveAnnouncement,
  setPinned,
} from "@/lib/policies/actions";
import type { Announcement } from "@/lib/policies/types";
import { idle, type FormState } from "@/lib/settings/form";
import { useFormAction } from "@/lib/use-form-action";

export type AdminAnnouncement = Announcement & {
  audienceLabel: string;
  readers: string[];
  audienceSize: number;
  /** Not published yet (decided by the server when the page loads). */
  scheduled: boolean;
};

// POL-01 for owner / HR: write (EN + BM), choose who it's for, pin, schedule; see who read it.
export function AnnouncementAdmin({
  announcements,
  branches,
  roles,
  canEdit,
}: {
  announcements: readonly AdminAnnouncement[];
  branches: readonly AudienceOption[];
  roles: readonly AudienceOption[];
  canEdit: boolean;
}) {
  const t = useTranslations("Announcements");
  const [writing, setWriting] = useState(false);
  return (
    <div className="flex flex-col gap-6">
      {canEdit ? (
        writing ? (
          <ComposeForm
            branches={branches}
            roles={roles}
            onDone={() => setWriting(false)}
          />
        ) : (
          <Button
            variant="accent"
            className="w-fit"
            onClick={() => setWriting(true)}
          >
            <Plus aria-hidden />
            {t("new")}
          </Button>
        )
      ) : null}
      <Card className="flex flex-col gap-2">
        <CardHeader title={t("all")} />
        {announcements.length === 0 ? (
          <EmptyState message={t("none")} />
        ) : (
          <ul className="divide-y divide-border">
            {announcements.map((a) => (
              <AdminRow key={a.id} announcement={a} canEdit={canEdit} />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function AdminRow({
  announcement: a,
  canEdit,
}: {
  announcement: AdminAnnouncement;
  canEdit: boolean;
}) {
  const t = useTranslations("Announcements");
  const locale = useLocale();
  const errorText = useErrorText();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<FormState | null>(null);
  const [showReaders, setShowReaders] = useState(false);
  const scheduled = a.scheduled;
  const when = new Date(a.publish_at);
  const act = (run: () => Promise<FormState>) =>
    startTransition(async () => setResult(await run()));

  return (
    <li className="flex flex-col gap-2 py-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="min-w-0 flex-1 text-h3 text-ink">
          {a.pinned ? (
            <Pin
              aria-label={t("pinned")}
              size={16}
              className="mr-1 inline text-primary"
            />
          ) : null}
          {locale === "ms" ? a.title_ms : a.title_en}
        </p>
        <span className="text-meta text-ink-muted">
          {scheduled
            ? t("scheduledFor", {
                when: `${formatDate(when, locale, "full")}, ${formatTime(when, locale)}`,
              })
            : formatDate(when, locale, "full")}
        </span>
      </div>
      <p className="line-clamp-3 text-body whitespace-pre-line text-ink-soft">
        {locale === "ms" ? a.body_ms : a.body_en}
      </p>
      <p className="text-meta text-ink-muted">
        {[
          a.audienceLabel,
          scheduled
            ? null
            : t("readCount", { read: a.readers.length, total: a.audienceSize }),
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
      <div className="flex flex-wrap gap-2">
        {!scheduled && a.readers.length ? (
          <Button
            variant="ghost"
            size="row"
            aria-expanded={showReaders}
            onClick={() => setShowReaders((v) => !v)}
          >
            {showReaders ? t("hideReaders") : t("showReaders")}
          </Button>
        ) : null}
        {canEdit ? (
          <>
            <Button
              variant="outline"
              size="row"
              disabled={pending}
              onClick={() => act(() => setPinned(a.id, !a.pinned))}
            >
              {a.pinned ? t("unpin") : t("pin")}
            </Button>
            <Button
              variant="ghost"
              size="row"
              disabled={pending}
              onClick={() => {
                if (window.confirm(t("deleteConfirm")))
                  act(() => deleteAnnouncement(a.id));
              }}
            >
              {t("delete")}
            </Button>
          </>
        ) : null}
      </div>
      {showReaders ? (
        <p className="text-meta text-ink-soft">{a.readers.join(", ")}</p>
      ) : null}
      {result?.status === "error" ? (
        <p role="alert" className="text-meta font-medium text-danger">
          {errorText(result.message ?? "saveFailed")}
        </p>
      ) : null}
    </li>
  );
}

function ComposeForm({
  branches,
  roles,
  onDone,
}: {
  branches: readonly AudienceOption[];
  roles: readonly AudienceOption[];
  onDone: () => void;
}) {
  const t = useTranslations("Announcements");
  const { state, onSubmit, pending } = useFormAction(saveAnnouncement, idle);
  const error = useFieldError(state);
  const savedAt = state.status === "saved" ? state.at : null;
  const done = useRef(onDone);
  useEffect(() => {
    if (savedAt !== null) done.current();
  }, [savedAt]);

  const area = (name: string, label: string) => (
    <div className="flex flex-col gap-2">
      <label htmlFor={name} className="text-label text-ink">
        {label}
      </label>
      <textarea
        id={name}
        name={name}
        rows={4}
        className="rounded-control border border-border bg-surface px-4 py-3 text-body text-ink outline-none focus-visible:border-primary"
      />
    </div>
  );

  return (
    <Card className="flex flex-col gap-5">
      <CardHeader title={t("new")} />
      <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
        <div className="grid gap-5 md:grid-cols-2">
          <TextField
            label={t("title_en")}
            name="title_en"
            error={error("title_en")}
          />
          <TextField
            label={t("title_ms")}
            name="title_ms"
            error={error("title_ms")}
          />
          {area("body_en", t("body_en"))}
          {area("body_ms", t("body_ms"))}
        </div>
        <AudienceFields
          branches={branches}
          roles={roles}
          error={error("audience_ids")}
        />
        <div className="grid gap-5 md:grid-cols-2">
          <TextField
            type="datetime-local"
            label={t("publish_at")}
            name="publish_at"
            hint={t("publish_atHint")}
            error={error("publish_at")}
          />
          <label className="flex min-h-11 items-center gap-3 self-end text-body text-ink">
            <input
              type="checkbox"
              name="pinned"
              className="size-5 accent-primary"
            />
            {t("pinField")}
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="accent" loading={pending}>
            {t("publish")}
          </Button>
          <Button type="button" variant="ghost" onClick={onDone}>
            {t("cancel")}
          </Button>
          <FormFeedback state={state} />
        </div>
      </form>
    </Card>
  );
}
