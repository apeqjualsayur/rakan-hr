"use client";

import { useActionState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  startPreboarding,
  type StartState,
} from "@/lib/hiring/preboarding-actions";

export function StartForm({ token }: { token: string }) {
  const t = useTranslations("Preboarding");
  const locale = useLocale();
  const [state, action, pending] = useActionState<StartState, FormData>(
    startPreboarding,
    { status: "idle" },
  );
  if (!token) return <p className="text-body text-ink-muted">{t("noToken")}</p>;
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="locale" value={locale} />
      <p className="text-meta text-ink-muted">{t("oneDevice")}</p>
      <Button type="submit" variant="accent" loading={pending} block>
        {t("open")}
      </Button>
      {state.status === "error" ? (
        <p role="alert" className="text-meta font-medium text-danger">
          {t(`linkErrors.${state.reason}`)}
        </p>
      ) : null}
    </form>
  );
}
