"use client";

import { useEffect, useState, useTransition } from "react";
import {
  AlertTriangle,
  Ban,
  ChevronLeft,
  ChevronRight,
  Copy,
  Plus,
  Send,
  Trash2,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import {
  FormFeedback,
  useErrorText,
  useFieldError,
} from "@/components/forms/FormFeedback";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/Card";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import { Link, useRouter } from "@/i18n/navigation";
import { dateFromIso, formatClock, formatDate } from "@/lib/format";
import type { Holiday, TeamLeave } from "@/lib/leave/types";
import { idle, type FormState } from "@/lib/settings/form";
import {
  checkShift,
  copyLastWeek,
  deleteShift,
  publishWeek,
  saveShift,
} from "@/lib/time/actions";
import { addDays, hhmm, shiftHours, weekDays } from "@/lib/time/logic";
import type { RosterShift, ShiftIssue } from "@/lib/time/types";
import { useFormAction } from "@/lib/use-form-action";
import { cn } from "@/lib/utils";

type Person = { id: string; full_name: string; job_title: string | null };
type Draft = { shift?: RosterShift; employeeId: string; date: string };

export function RosterBuilder({
  monday,
  branchId,
  branches,
  staff,
  others,
  shifts,
  issues,
  compliance,
  leave,
  holidays,
  canEdit,
  today,
}: {
  monday: string;
  branchId: string;
  branches: readonly { id: string; name: string | null }[];
  staff: readonly Person[];
  others: readonly Person[];
  shifts: readonly RosterShift[];
  issues: readonly (ShiftIssue & { shift_id: string })[];
  compliance: Record<string, number | null>;
  leave: readonly TeamLeave[];
  holidays: readonly Holiday[];
  canEdit: boolean;
  today: string;
}) {
  const t = useTranslations("Time.roster");
  const locale = useLocale();
  const router = useRouter();
  const errorText = useErrorText();
  const days = weekDays(monday);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const unpublished = shifts.filter((s) => !s.published_at).length;
  const href = (week: string, branch = branchId) =>
    `/admin/time/roster?week=${week}&branch=${branch}`;
  const issuesOf = (id: string) => issues.filter((i) => i.shift_id === id);
  const weekHours = (employeeId: string) =>
    shifts
      .filter((s) => s.employee_id === employeeId && !s.is_on_call)
      .reduce(
        (sum, s) => sum + shiftHours(s.start_time, s.end_time, s.break_minutes),
        0,
      );

  const run = (
    fn: () => Promise<FormState & { count?: number }>,
    ok: (n: number) => string,
  ) =>
    startTransition(async () => {
      const r = await fn();
      setMessage(
        r.status === "error"
          ? errorText(r.message ?? "saveFailed")
          : ok(r.count ?? 0),
      );
    });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={href(addDays(monday, -7))}
            aria-label={t("previous")}
            className="grid size-11 place-items-center rounded-full text-ink-soft hover:bg-surface"
          >
            <ChevronLeft aria-hidden size={20} strokeWidth={1.75} />
          </Link>
          <h2 className="text-h2 text-ink">
            {t("weekOf", {
              date: formatDate(dateFromIso(monday), locale, "full"),
            })}
          </h2>
          <Link
            href={href(addDays(monday, 7))}
            aria-label={t("next")}
            className="grid size-11 place-items-center rounded-full text-ink-soft hover:bg-surface"
          >
            <ChevronRight aria-hidden size={20} strokeWidth={1.75} />
          </Link>
          {branches.length > 1 ? (
            <select
              aria-label={t("branch")}
              value={branchId}
              onChange={(e) => router.push(href(monday, e.target.value))}
              className="h-11 rounded-control border border-border bg-surface px-3 text-body"
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name ?? t("unnamedBranch")}
                </option>
              ))}
            </select>
          ) : null}
        </div>
        {canEdit ? (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              loading={pending}
              onClick={() =>
                run(
                  () => copyLastWeek(branchId, monday),
                  (n) => t("copied", { count: n }),
                )
              }
            >
              <Copy aria-hidden />
              {t("copy")}
            </Button>
            <Button
              type="button"
              variant="accent"
              disabled={pending || unpublished === 0}
              onClick={() =>
                run(
                  () => publishWeek(branchId, monday),
                  (n) => t("published", { count: n }),
                )
              }
            >
              <Send aria-hidden />
              {unpublished
                ? t("publish", { count: unpublished })
                : t("allPublished")}
            </Button>
          </div>
        ) : null}
      </div>
      {message ? (
        <p role="status" className="text-meta font-medium text-primary">
          {message}
        </p>
      ) : null}

      <Card className="overflow-x-auto p-3 md:p-4">
        <table className="w-full min-w-[1080px] table-fixed border-separate border-spacing-1 text-meta">
          <thead>
            <tr>
              <th className="w-48 text-left text-label text-ink-muted">
                {t("person")}
              </th>
              {days.map((d) => {
                const h = holidays.filter((x) => x.holiday_date === d);
                return (
                  <th
                    key={d}
                    className={cn(
                      "text-left align-bottom font-medium",
                      d === today ? "text-primary" : "text-ink",
                    )}
                  >
                    <span className="block">
                      {formatDate(dateFromIso(d), locale, "weekdayShort")}
                    </span>
                    {h.map((x) => (
                      <span
                        key={x.name_en}
                        className="block truncate text-meta font-normal text-info"
                        title={locale === "ms" ? x.name_ms : x.name_en}
                      >
                        {locale === "ms" ? x.name_ms : x.name_en}
                      </span>
                    ))}
                  </th>
                );
              })}
              <th className="w-20 text-right text-label text-ink-muted">
                {t("hours")}
              </th>
            </tr>
          </thead>
          <tbody>
            {staff.map((p) => {
              const hours = weekHours(p.id);
              const pct = compliance[p.id];
              return (
                <tr key={p.id}>
                  <td className="align-top">
                    <span className="block text-body font-medium text-ink">
                      {p.full_name}
                    </span>
                    <span
                      className={cn(
                        "text-meta",
                        pct !== undefined && pct !== null && pct < 100
                          ? "text-warning"
                          : "text-ink-muted",
                      )}
                    >
                      {pct === undefined || pct === null
                        ? (p.job_title ?? "")
                        : t("compliance", { pct })}
                    </span>
                  </td>
                  {days.map((d) => {
                    const cell = shifts.filter(
                      (s) => s.employee_id === p.id && s.shift_date === d,
                    );
                    const off = leave.filter(
                      (l) =>
                        l.employee_id === p.id &&
                        l.start_date <= d &&
                        l.end_date >= d,
                    );
                    return (
                      <td
                        key={d}
                        className="h-20 rounded-tile border border-border bg-surface p-1.5 align-top"
                      >
                        {off.map((l) => (
                          <span
                            key={l.request_id}
                            className="mb-1 block rounded-sm bg-neutral-tint px-1.5 py-0.5 text-neutral"
                          >
                            {l.type_name_en
                              ? locale === "ms"
                                ? l.type_name_ms
                                : l.type_name_en
                              : t("onLeave")}
                            {l.status === "pending" ? ` · ${t("pending")}` : ""}
                          </span>
                        ))}
                        {cell.map((s) => {
                          const list = issuesOf(s.id);
                          const blocked = list.some(
                            (i) => i.severity === "block",
                          );
                          const warned = list.length > 0;
                          return (
                            <button
                              key={s.id}
                              type="button"
                              disabled={!canEdit}
                              onClick={() =>
                                setDraft({
                                  shift: s,
                                  employeeId: s.employee_id,
                                  date: s.shift_date,
                                })
                              }
                              className={cn(
                                "mb-1 flex w-full flex-col rounded-sm px-1.5 py-1 text-left",
                                blocked
                                  ? "bg-danger-tint text-danger"
                                  : warned
                                    ? "bg-warning-tint text-warning"
                                    : "bg-primary-tint text-primary-strong",
                                !s.published_at &&
                                  "border border-dashed border-current",
                              )}
                              title={list.map((i) => i.code).join(", ")}
                            >
                              <span className="flex items-center gap-1 font-medium tabular-nums">
                                {blocked ? (
                                  <Ban aria-hidden size={12} />
                                ) : warned ? (
                                  <AlertTriangle aria-hidden size={12} />
                                ) : null}
                                {hhmm(s.start_time)}–{hhmm(s.end_time)}
                              </span>
                              {s.room_or_service ? (
                                <span className="truncate">
                                  {s.room_or_service}
                                </span>
                              ) : null}
                              {!s.published_at ? (
                                <span className="text-[11px] opacity-80">
                                  {t("draft")}
                                </span>
                              ) : null}
                            </button>
                          );
                        })}
                        {canEdit ? (
                          <button
                            type="button"
                            aria-label={t("addFor", {
                              name: p.full_name,
                              date: d,
                            })}
                            onClick={() =>
                              setDraft({ employeeId: p.id, date: d })
                            }
                            className="grid h-7 w-full place-items-center rounded-sm text-ink-muted hover:bg-canvas"
                          >
                            <Plus aria-hidden size={16} />
                          </button>
                        ) : null}
                      </td>
                    );
                  })}
                  <td
                    className={cn(
                      "text-right align-top text-body tabular-nums",
                      hours > 45 ? "font-bold text-warning" : "text-ink",
                    )}
                  >
                    {Number.isInteger(hours) ? hours : hours.toFixed(1)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="mt-2 text-meta text-ink-muted">{t("legend")}</p>
      </Card>

      {draft && canEdit ? (
        <ShiftForm
          key={`${draft.shift?.id ?? "new"}-${draft.employeeId}-${draft.date}`}
          draft={draft}
          branchId={branchId}
          people={[...staff, ...others]}
          onDone={() => setDraft(null)}
        />
      ) : null}
    </div>
  );
}

function ShiftForm({
  draft,
  branchId,
  people,
  onDone,
}: {
  draft: Draft;
  branchId: string;
  people: readonly Person[];
  onDone: () => void;
}) {
  const t = useTranslations("Time.roster");
  const locale = useLocale();
  const { state, onSubmit, pending } = useFormAction(saveShift, idle);
  const error = useFieldError(state);
  const s = draft.shift;
  const [employee, setEmployee] = useState(draft.employeeId);
  const [date, setDate] = useState(draft.date);
  const [start, setStart] = useState(s ? hhmm(s.start_time) : "08:30");
  const [end, setEnd] = useState(s ? hhmm(s.end_time) : "17:30");
  const [brk, setBrk] = useState(String(s?.break_minutes ?? 60));
  const [checks, setChecks] = useState<ShiftIssue[]>([]);
  const [removing, startRemove] = useTransition();

  useEffect(() => {
    let live = true;
    checkShift(
      employee,
      date,
      start,
      end,
      Number(brk) || 0,
      s?.id ?? null,
    ).then((r) => live && setChecks(r));
    return () => {
      live = false;
    };
  }, [employee, date, start, end, brk, s?.id]);

  useEffect(() => {
    if (state.status === "saved") onDone();
  }, [state, onDone]);

  const describe = (i: ShiftIssue) => {
    const d = i.detail as Record<string, string | number | null>;
    switch (i.code) {
      case "LEAVE":
        return t("issues.LEAVE", {
          type: String(locale === "ms" ? d.type_ms : d.type_en),
          status: String(d.status),
        });
      case "WEEK_HOURS":
        return t("issues.WEEK_HOURS", {
          hours: String(d.hours),
          cap: String(d.cap),
        });
      case "CREDENTIAL":
        return t(
          i.severity === "block"
            ? "issues.CREDENTIAL_BLOCK"
            : "issues.CREDENTIAL",
          {
            type: String(locale === "ms" ? d.type_ms : d.type_en),
            status: t(`credentialStatus.${d.status as "expired"}`),
          },
        );
      case "HOLIDAY":
        return t("issues.HOLIDAY", {
          name: String(locale === "ms" ? d.name_ms : d.name_en),
        });
      default:
        return t("issues.REST_DAY");
    }
  };

  return (
    <Card className="flex flex-col gap-4">
      <CardHeader title={s ? t("editShift") : t("newShift")} as="h3" />
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <input type="hidden" name="branch_id" value={branchId} />
        {s ? <input type="hidden" name="shift_id" value={s.id} /> : null}
        <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
          <SelectField
            className="md:col-span-2"
            label={t("person")}
            name="employee_id"
            value={employee}
            onChange={(e) => setEmployee(e.target.value)}
            error={error("employee_id")}
          >
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name}
              </option>
            ))}
          </SelectField>
          <TextField
            type="date"
            label={t("date")}
            name="shift_date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            error={error("shift_date")}
          />
          <TextField
            type="time"
            label={t("start")}
            name="start_time"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            error={error("start_time")}
          />
          <TextField
            type="time"
            label={t("end")}
            name="end_time"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            error={error("end_time")}
          />
          <TextField
            label={t("break")}
            name="break_minutes"
            inputMode="numeric"
            value={brk}
            onChange={(e) => setBrk(e.target.value)}
            error={error("break_minutes")}
          />
          <TextField
            className="md:col-span-2"
            label={t("room")}
            name="room_or_service"
            defaultValue={s?.room_or_service ?? ""}
            hint={t("roomHint")}
          />
          <TextField
            className="md:col-span-3"
            label={t("notes")}
            name="notes"
            defaultValue={s?.notes ?? ""}
          />
          <label className="flex items-center gap-2 self-end pb-3 text-body text-ink">
            <input
              type="checkbox"
              name="is_on_call"
              defaultChecked={s?.is_on_call}
              className="size-5 accent-primary"
            />
            {t("onCall")}
          </label>
        </div>
        <p className="text-meta text-ink-muted">
          {t("paidHours", {
            hours: String(
              Math.max(
                0,
                shiftHours(start || "00:00", end || "00:00", Number(brk) || 0),
              ),
            ),
          })}{" "}
          · {formatClock(start || "00:00", locale)} –{" "}
          {formatClock(end || "00:00", locale)}
        </p>
        {checks.length ? (
          <ul className="flex flex-col gap-1">
            {checks.map((i, n) => (
              <li
                key={`${i.code}-${n}`}
                className={cn(
                  "flex items-start gap-2 rounded-tile px-3 py-2 text-meta",
                  i.severity === "block"
                    ? "bg-danger-tint text-danger"
                    : "bg-warning-tint text-warning",
                )}
              >
                {i.severity === "block" ? (
                  <Ban aria-hidden size={16} className="mt-0.5 shrink-0" />
                ) : (
                  <AlertTriangle
                    aria-hidden
                    size={16}
                    className="mt-0.5 shrink-0"
                  />
                )}
                {describe(i)}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-meta text-primary">{t("noIssues")}</p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" loading={pending}>
            {s ? t("save") : t("add")}
          </Button>
          {s ? (
            <Button
              type="button"
              variant="ghost"
              loading={removing}
              onClick={() =>
                startRemove(async () => {
                  const r = await deleteShift(s.id);
                  if (r.status === "saved") onDone();
                })
              }
            >
              <Trash2 aria-hidden />
              {t("delete")}
            </Button>
          ) : null}
          <Button type="button" variant="ghost" onClick={onDone}>
            {t("cancel")}
          </Button>
          <FormFeedback state={state} />
        </div>
      </form>
    </Card>
  );
}
