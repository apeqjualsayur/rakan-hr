"use client";

import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/Card";
import { TextField } from "@/components/ui/TextField";
import { idle } from "@/lib/settings/form";
import { useFormAction } from "@/lib/use-form-action";
import { FormFeedback, useFieldError } from "../_components/FormFeedback";
import { inviteMember } from "./actions";
import { RoleFields, type BranchOption } from "./RoleFields";

// Invite by email with a role. The person signs in with a code sent to that email; the
// invite email itself is sent by the database (Edge Function). One accent: Send invite.
export function InviteForm({
  branches,
}: {
  branches: readonly BranchOption[];
}) {
  const t = useTranslations("Settings.users");
  const { state, onSubmit, pending } = useFormAction(inviteMember, idle);
  const error = useFieldError(state);
  const form = useRef<HTMLFormElement>(null);
  const [lastEmail, setLastEmail] = useState("");
  const savedAt = state.status === "saved" ? state.at : null;

  useEffect(() => {
    if (savedAt !== null) form.current?.reset();
  }, [savedAt]);

  return (
    <Card className="flex h-fit flex-col gap-5">
      <CardHeader title={t("inviteTitle")} />
      <p className="-mt-3 text-meta text-ink-muted">{t("intro")}</p>
      <form
        ref={form}
        onSubmit={(e) => {
          setLastEmail(
            String(new FormData(e.currentTarget).get("email") ?? ""),
          );
          onSubmit(e);
        }}
        className="flex flex-col gap-5"
        noValidate
      >
        <TextField
          label={t("email")}
          name="email"
          type="email"
          autoComplete="off"
          placeholder={t("emailPlaceholder")}
          error={error("email")}
          required
        />
        {/* Remounts after each successful invite so the role resets too. */}
        <RoleFields
          key={savedAt ?? 0}
          defaultRole="staff"
          branches={branches}
          error={error("role")}
        />
        <Button type="submit" variant="accent" loading={pending} block>
          <Send aria-hidden />
          {t("sendInvite")}
        </Button>
        {state.status === "saved" ? (
          <p role="status" className="text-meta font-medium text-primary">
            {t("invited", { email: lastEmail.trim().toLowerCase() })}
          </p>
        ) : (
          <FormFeedback state={state} />
        )}
      </form>
    </Card>
  );
}
