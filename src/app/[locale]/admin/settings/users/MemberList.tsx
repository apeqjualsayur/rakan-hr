"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/Card";
import { PersonAvatar } from "@/components/ui/PersonRow";
import { StatusChip } from "@/components/ui/StatusChip";
import { formatDate } from "@/lib/format";
import { idle, type FormState } from "@/lib/settings/form";
import { memberStatus, type MemberRow } from "@/lib/settings/members";
import { useFormAction } from "@/lib/use-form-action";
import { FormFeedback, useErrorText } from "@/components/forms/FormFeedback";
import {
  removeInvite,
  resendInvite,
  setMemberActive,
  updateMemberRole,
} from "./actions";
import { RoleFields, type BranchOption } from "./RoleFields";

export function MemberList({
  members,
  branches,
  currentMembershipId,
  canManage,
}: {
  members: readonly MemberRow[];
  branches: readonly BranchOption[];
  currentMembershipId: string | null;
  canManage: boolean;
}) {
  const t = useTranslations("Settings.users");
  return (
    <Card className="flex min-w-0 flex-col gap-2">
      <CardHeader title={t("listTitle")} />
      <ul className="divide-y divide-border">
        {members.map((m) => (
          <MemberItem
            key={m.id}
            member={m}
            branches={branches}
            isSelf={m.id === currentMembershipId}
            canManage={canManage}
          />
        ))}
      </ul>
    </Card>
  );
}

function MemberItem({
  member,
  branches,
  isSelf,
  canManage,
}: {
  member: MemberRow;
  branches: readonly BranchOption[];
  isSelf: boolean;
  canManage: boolean;
}) {
  const t = useTranslations("Settings.users");
  const tr = useTranslations("Roles");
  const locale = useLocale();
  const errorText = useErrorText();
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<FormState>(idle);
  const status = memberStatus(member);
  const name = member.invited_email ?? t("noEmail");
  const day = (iso: string) => formatDate(new Date(iso), locale, "full");

  const run = (action: () => Promise<FormState>, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    startTransition(async () => setResult(await action()));
  };

  const meta = [
    tr(`${member.role}.name`),
    member.role === "manager" && member.branch_ids.length
      ? branches
          .filter((b) => member.branch_ids.includes(b.id))
          .map((b) => b.name)
          .join(", ")
      : null,
    status === "invited"
      ? member.invite_error
        ? t("inviteFailed")
        : member.invite_sent_at
          ? t("inviteSent", { date: day(member.invite_sent_at) })
          : t("invitedOn", { date: day(member.created_at) })
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <li className="flex flex-col gap-4 py-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-4">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <PersonAvatar id={member.user_id ?? member.id} name={name} />
          <div className="min-w-0 flex-1">
            <p className="text-h3 break-all text-ink">
              {name}
              {isSelf ? (
                <span className="ml-2 text-meta font-normal text-ink-muted">
                  ({t("you")})
                </span>
              ) : null}
            </p>
            <p
              className={
                member.invite_error && status === "invited"
                  ? "text-meta font-medium text-danger"
                  : "text-meta text-ink-muted"
              }
            >
              {meta}
            </p>
          </div>
          <StatusChip domain="membership" status={status} />
        </div>

        {canManage && !isSelf ? (
          <div className="flex flex-wrap gap-2 md:justify-end">
            {status !== "deactivated" ? (
              <Button
                variant="outline"
                size="row"
                aria-expanded={editing}
                onClick={() => setEditing((v) => !v)}
              >
                {t("changeRole")}
              </Button>
            ) : null}
            {status === "invited" ? (
              <>
                <Button
                  variant="ghost"
                  size="row"
                  disabled={pending}
                  onClick={() => run(() => resendInvite(member.id))}
                >
                  {t("resend")}
                </Button>
                <Button
                  variant="danger-outline"
                  size="row"
                  disabled={pending}
                  onClick={() =>
                    run(
                      () => removeInvite(member.id),
                      t("removeConfirm", { email: name }),
                    )
                  }
                >
                  {t("remove")}
                </Button>
              </>
            ) : status === "active" ? (
              <Button
                variant="danger-outline"
                size="row"
                disabled={pending}
                onClick={() =>
                  run(
                    () => setMemberActive(member.id, false),
                    t("deactivateConfirm", { email: name }),
                  )
                }
              >
                {t("deactivate")}
              </Button>
            ) : (
              <Button
                variant="outline"
                size="row"
                disabled={pending}
                onClick={() => run(() => setMemberActive(member.id, true))}
              >
                {t("reactivate")}
              </Button>
            )}
          </div>
        ) : null}
      </div>

      {result.status !== "idle" ? (
        <p
          role={result.status === "error" ? "alert" : "status"}
          className={
            result.status === "error"
              ? "text-meta font-medium text-danger"
              : "text-meta font-medium text-primary"
          }
        >
          {result.status === "error"
            ? errorText(result.message ?? "saveFailed")
            : t("done")}
        </p>
      ) : null}

      {editing ? (
        <RoleEditor
          member={member}
          branches={branches}
          onDone={() => setEditing(false)}
        />
      ) : null}
    </li>
  );
}

function RoleEditor({
  member,
  branches,
  onDone,
}: {
  member: MemberRow;
  branches: readonly BranchOption[];
  onDone: () => void;
}) {
  const t = useTranslations("Settings.users");
  const ts = useTranslations("Settings");
  const { state, onSubmit, pending } = useFormAction(updateMemberRole, idle);

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-4 rounded-tile border border-border bg-canvas p-4 md:ml-16"
    >
      <input type="hidden" name="membership_id" value={member.id} />
      <RoleFields
        defaultRole={member.role}
        defaultBranchIds={member.branch_ids}
        branches={branches}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="row" loading={pending}>
          {t("saveRole")}
        </Button>
        <Button type="button" variant="ghost" size="row" onClick={onDone}>
          {ts("cancel")}
        </Button>
        <FormFeedback state={state} />
      </div>
    </form>
  );
}
