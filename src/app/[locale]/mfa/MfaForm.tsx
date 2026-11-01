"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { CodeField } from "@/components/layout/CodeField";
import { SubmitButton } from "@/components/layout/SubmitButton";
import { Skeleton } from "@/components/ui/skeleton";
import { useRouter } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";

type Enrolment = { factorId: string; qrCode?: string; secret?: string };

// PRD §7: TOTP for owner / HR admin / payroll approver. "setup" enrols a new authenticator;
// "verify" challenges the one already set up. Success upgrades the session to aal2.
export function MfaForm({ mode }: { mode: "setup" | "verify" }) {
  const t = useTranslations("Auth");
  const router = useRouter();
  const [enrolment, setEnrolment] = useState<Enrolment>();
  const [error, setError] = useState<string>();
  const started = useRef(false);

  useEffect(() => {
    // Strict Mode runs effects twice in development; enrol only once.
    if (started.current) return;
    started.current = true;
    const supabase = createClient();

    (async () => {
      const { data: factors, error: listError } =
        await supabase.auth.mfa.listFactors();
      if (listError) return setError(t("genericError"));

      if (mode === "verify") {
        const factor = factors.totp.find((f) => f.status === "verified");
        return factor
          ? setEnrolment({ factorId: factor.id })
          : setError(t("genericError"));
      }

      // Clear half-finished set-ups (e.g. the page was reloaded before confirming).
      for (const factor of factors.all) {
        if (factor.factor_type === "totp" && factor.status === "unverified") {
          await supabase.auth.mfa.unenroll({ factorId: factor.id });
        }
      }
      const { data, error: enrolError } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        issuer: "Rakan",
      });
      if (enrolError) return setError(t("genericError"));
      setEnrolment({
        factorId: data.id,
        qrCode: data.totp.qr_code,
        secret: data.totp.secret,
      });
    })();
  }, [mode, t]);

  async function confirm(formData: FormData) {
    if (!enrolment) return;
    setError(undefined);
    const code = String(formData.get("code") ?? "");
    const { error: verifyError } =
      await createClient().auth.mfa.challengeAndVerify({
        factorId: enrolment.factorId,
        code,
      });
    if (verifyError) return setError(t("mfaInvalid"));
    // The browser client has stored the upgraded (aal2) session cookie; the landing
    // page reads it on the server and routes by role.
    router.replace("/");
    router.refresh();
  }

  if (!enrolment) {
    return error ? (
      <p role="alert" className="text-meta font-medium text-danger">
        {error}
      </p>
    ) : (
      <div className="flex flex-col items-center gap-4" aria-busy>
        {mode === "setup" ? <Skeleton className="size-48" /> : null}
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  return (
    <form action={confirm} className="flex flex-col gap-5">
      {enrolment.qrCode ? (
        <div className="flex flex-col items-center gap-3">
          {/* Supabase returns the QR code as an SVG data URL. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={enrolment.qrCode}
            alt={t("qrAlt")}
            className="size-48 rounded-control border border-border bg-white p-2"
          />
          <p className="text-meta text-ink-muted">{t("mfaManualKey")}</p>
          <code className="rounded-control bg-canvas px-3 py-2 text-meta break-all text-ink select-all">
            {enrolment.secret}
          </code>
        </div>
      ) : null}
      <CodeField label={t("mfaCodeLabel")} error={error} />
      <SubmitButton variant="accent">{t("mfaConfirm")}</SubmitButton>
    </form>
  );
}
