"use client";

import { useEffect, useState, useTransition } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { MaskedValue } from "@/components/ui/MaskedValue";
import type { ErrorKey } from "@/lib/settings/form";

const HIDE_AFTER_MS = 30_000;

// Masked number (••5678) with a Show button for owner / HR admin. The full number is
// fetched on demand (each reveal is audit-logged) and hidden again after 30 seconds.
export function RevealValue({
  prefix,
  last4,
  reveal,
}: {
  prefix?: string;
  last4: string;
  /** Omit for people who may only see the masked value. */
  reveal?: () => Promise<{ value: string } | { error: ErrorKey }>;
}) {
  const t = useTranslations("People");
  const [value, setValue] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (value === null) return;
    const timer = window.setTimeout(() => setValue(null), HIDE_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, [value]);

  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      {value ? (
        <span className="text-body text-ink tabular-nums">
          {prefix ? `${prefix} ` : null}
          {value}
        </span>
      ) : (
        <span className="text-body text-ink">
          <MaskedValue prefix={prefix} value={last4} />
        </span>
      )}
      {reveal ? (
        <Button
          type="button"
          variant="ghost"
          size="row"
          className="h-11 px-3"
          loading={pending}
          onClick={() => {
            if (value) {
              setValue(null);
              return;
            }
            setFailed(false);
            startTransition(async () => {
              const result = await reveal();
              if ("value" in result) setValue(result.value);
              else setFailed(true);
            });
          }}
        >
          {value ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
          {value ? t("hide") : t("reveal")}
        </Button>
      ) : null}
      {failed ? (
        <span role="alert" className="text-meta text-danger">
          {t("revealFailed")}
        </span>
      ) : null}
    </span>
  );
}
