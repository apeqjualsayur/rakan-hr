"use client";

import { useState, useTransition } from "react";
import { ExternalLink } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { cvUrl, offerFileUrl, probationLetterUrl } from "@/lib/hiring/actions";

// Opens a private file through a 5-minute signed link made on the server.
export function OpenFileButton({
  kind,
  id,
  label,
  variant = "outline",
}: {
  kind: "cv" | "offer" | "probationLetter";
  id: string;
  label: string;
  variant?: "outline" | "ghost" | "link";
}) {
  const t = useTranslations("Hiring");
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <span className="inline-flex flex-col gap-1 self-start">
      <Button
        type="button"
        variant={variant}
        size={variant === "link" ? "default" : "row"}
        loading={pending}
        onClick={() =>
          startTransition(async () => {
            // Open the tab now (popup blockers), then point it at the file.
            const tab = window.open("", "_blank");
            const result =
              kind === "cv"
                ? await cvUrl(id)
                : kind === "offer"
                  ? await offerFileUrl(id)
                  : await probationLetterUrl(id);
            if ("url" in result) {
              setFailed(false);
              if (tab) tab.location.href = result.url;
              else window.location.href = result.url;
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
