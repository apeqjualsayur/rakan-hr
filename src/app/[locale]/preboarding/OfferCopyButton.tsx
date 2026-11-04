"use client";

import { useState, useTransition } from "react";
import { ExternalLink } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { preboardingOfferUrl } from "@/lib/hiring/preboarding-actions";

/** The candidate's signed offer, through a 5-minute link. */
export function OfferCopyButton({ label }: { label: string }) {
  const t = useTranslations("Preboarding");
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <span className="inline-flex flex-col gap-1 self-start">
      <Button
        type="button"
        variant="outline"
        size="row"
        loading={pending}
        onClick={() =>
          startTransition(async () => {
            const tab = window.open("", "_blank");
            const url = await preboardingOfferUrl();
            if (url) {
              setFailed(false);
              if (tab) tab.location.href = url;
              else window.location.href = url;
            } else {
              tab?.close();
              setFailed(true);
            }
          })
        }
      >
        <ExternalLink aria-hidden />
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
