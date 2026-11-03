"use client";

import { useState, useTransition } from "react";
import { ExternalLink } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useErrorText } from "@/components/forms/FormFeedback";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/Card";
import { TextField } from "@/components/ui/TextField";
import { useRouter } from "@/i18n/navigation";
import { consentText } from "@/lib/policies/logic";
import type { SignResult } from "@/lib/policies/sign";

// POL-03 click-to-sign, reused for policies now and offers / contracts in Step 8: the PDF,
// the consent wording, a tick and the typed full name. The server stamps the signature
// page and records who, when, IP, device and the document's fingerprint.
export function SignDocument({
  entityId,
  pdfUrl,
  expectedName,
  sign,
  doneHref,
}: {
  entityId: string;
  /** 5-minute signed link to the exact PDF being signed. */
  pdfUrl: string | null;
  /** The name on the signer's record, which they must type; null when there is none. */
  expectedName: string | null;
  sign: (
    entityId: string,
    typedName: string,
    consented: boolean,
    locale: string,
  ) => Promise<SignResult>;
  doneHref: string;
}) {
  const t = useTranslations("Policies.sign");
  const locale = useLocale();
  const errorText = useErrorText();
  const router = useRouter();
  const [name, setName] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [result, setResult] = useState<SignResult | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-3 p-3 md:p-4">
        {pdfUrl ? (
          <>
            <iframe
              src={pdfUrl}
              title={t("document")}
              className="h-[60dvh] w-full rounded-tile border border-border bg-canvas"
            />
            <a
              href={pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center gap-1 self-start px-2 text-label text-primary underline-offset-4 hover:underline"
            >
              {t("openPdf")}
              <ExternalLink aria-hidden size={16} strokeWidth={1.75} />
            </a>
          </>
        ) : (
          <p className="p-3 text-meta text-danger">{t("noPdf")}</p>
        )}
      </Card>

      <Card className="flex flex-col gap-4">
        <label className="flex cursor-pointer items-start gap-3 text-body text-ink">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-0.5 size-5 shrink-0 accent-primary"
          />
          {consentText(locale)}
        </label>
        <TextField
          label={t("typedName")}
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
          hint={
            expectedName
              ? t("typedNameHint", { name: expectedName })
              : undefined
          }
          error={
            result && !result.ok && result.error === "nameMismatch"
              ? errorText("nameMismatch")
              : undefined
          }
        />
        <Button
          variant="accent"
          block
          loading={pending}
          disabled={!agreed || name.trim() === ""}
          onClick={() =>
            startTransition(async () => {
              const outcome = await sign(entityId, name, agreed, locale);
              setResult(outcome);
              if (outcome.ok) {
                router.push(doneHref);
                router.refresh();
              }
            })
          }
        >
          {t("sign")}
        </Button>
        <p className="text-meta text-ink-muted">{t("recorded")}</p>
        {result && !result.ok && result.error !== "nameMismatch" ? (
          <p role="alert" className="text-meta font-medium text-danger">
            {errorText(result.error)}
          </p>
        ) : null}
      </Card>
    </div>
  );
}
