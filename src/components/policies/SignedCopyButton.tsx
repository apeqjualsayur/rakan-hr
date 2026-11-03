"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { policyFileUrl, signedCopyUrl } from "@/lib/policies/actions";

/** Opens a signed copy (or, with `policyId`, the original PDF) through a 5-minute link. */
export function SignedCopyButton({
  signatureId,
  policyId,
  label,
  variant = "outline",
}: {
  signatureId?: string;
  policyId?: string;
  label: string;
  variant?: "outline" | "ghost" | "link";
}) {
  const t = useTranslations("Policies");
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);
  return (
    <span className="inline-flex flex-col gap-1">
      <Button
        variant={variant}
        size={variant === "link" ? "default" : "row"}
        disabled={pending}
        onClick={() => {
          setFailed(false);
          const tab = window.open("", "_blank");
          startTransition(async () => {
            const res = signatureId
              ? await signedCopyUrl(signatureId)
              : await policyFileUrl(policyId!);
            if ("url" in res && tab) {
              tab.opener = null;
              tab.location.href = res.url;
            } else {
              tab?.close();
              setFailed(true);
            }
          });
        }}
      >
        {label}
      </Button>
      {failed ? (
        <span role="alert" className="text-meta text-danger">
          {t("openFailed")}
        </span>
      ) : null}
    </span>
  );
}
