"use client";

import { useTranslations } from "next-intl";
import type { ErrorKey, FieldErrors, FormState } from "@/lib/settings/form";

/** Field error text for a parsed form (Settings.errors). */
export function useFieldError(state: FormState) {
  const t = useTranslations("Settings.errors");
  const errors: FieldErrors =
    state.status === "error" ? (state.errors ?? {}) : {};
  return (name: string) => {
    const key = errors[name];
    return key ? t(key) : undefined;
  };
}

export function useErrorText() {
  const t = useTranslations("Settings.errors");
  return (key: ErrorKey) => t(key);
}

/** "Saved." or the form-level error, announced to screen readers. */
export function FormFeedback({ state }: { state: FormState }) {
  const t = useTranslations("Settings");
  if (state.status === "saved") {
    return (
      <p role="status" className="text-meta font-medium text-primary">
        {t("saved")}
      </p>
    );
  }
  if (state.status === "error") {
    return (
      <p role="alert" className="text-meta font-medium text-danger">
        {t(
          `errors.${state.message ?? (state.errors ? "checkFields" : "saveFailed")}`,
        )}
      </p>
    );
  }
  return <p role="status" className="sr-only" />;
}

/** Shown to roles that can see but not change a settings page. */
export function ReadOnlyNote({ who }: { who: "owner" | "ownerHr" }) {
  const t = useTranslations("Settings");
  return (
    <p className="rounded-tile bg-neutral-tint px-4 py-3 text-meta text-neutral">
      {t("readOnly", { who: t(`readOnlyWho.${who}`) })}
    </p>
  );
}
