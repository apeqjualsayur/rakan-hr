"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CodeField } from "@/components/layout/CodeField";
import { SubmitButton } from "@/components/layout/SubmitButton";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/TextField";
import { requestCode, verifyCode } from "@/lib/auth/actions";

type Step = { name: "email" } | { name: "code"; email: string };

// FND-01: email → 6-digit code → signed in (the landing page then routes by role).
export function LoginForm() {
  const t = useTranslations("Auth");
  const locale = useLocale();
  const [step, setStep] = useState<Step>({ name: "email" });
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();

  async function sendCode(formData: FormData) {
    setError(undefined);
    setNotice(undefined);
    const result = await requestCode(formData);
    if (result.status === "sent") {
      if (step.name === "code") setNotice(t("resent"));
      setStep({ name: "code", email: result.email });
    } else if (result.status === "invalid_email") {
      setError(t("invalidEmail"));
    } else if (result.status === "rate_limited") {
      setError(t("rateLimited"));
    } else {
      setError(t("genericError"));
    }
  }

  async function checkCode(formData: FormData) {
    setError(undefined);
    setNotice(undefined);
    // On success the server action redirects, so a result means it failed.
    const result = await verifyCode(formData);
    setError(
      result.status === "invalid_code" ? t("invalidCode") : t("genericError"),
    );
  }

  if (step.name === "email") {
    return (
      <form action={sendCode} className="flex flex-col gap-5" noValidate>
        <TextField
          label={t("emailLabel")}
          name="email"
          type="email"
          autoComplete="email"
          placeholder={t("emailPlaceholder")}
          error={error}
          required
          autoFocus
        />
        <SubmitButton variant="accent">{t("sendCode")}</SubmitButton>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="text-body text-ink-soft">
        {t("codeIntro", { email: step.email })}
      </p>
      <form action={checkCode} className="flex flex-col gap-5">
        <input type="hidden" name="email" value={step.email} />
        <input type="hidden" name="locale" value={locale} />
        <CodeField label={t("codeLabel")} error={error} />
        <SubmitButton variant="accent">{t("verify")}</SubmitButton>
      </form>
      {notice ? (
        <p role="status" className="text-meta text-ink-muted">
          {notice}
        </p>
      ) : null}
      <div className="flex flex-wrap justify-between gap-2">
        <Button
          type="button"
          variant="link"
          onClick={() => {
            setError(undefined);
            setNotice(undefined);
            setStep({ name: "email" });
          }}
        >
          {t("useDifferentEmail")}
        </Button>
        <form action={sendCode}>
          <input type="hidden" name="email" value={step.email} />
          <Button type="submit" variant="link">
            {t("resend")}
          </Button>
        </form>
      </div>
    </div>
  );
}
