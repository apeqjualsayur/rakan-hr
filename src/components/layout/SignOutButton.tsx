"use client";

import { LogOut } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/auth/actions";

export function SignOutButton({ compact = false }: { compact?: boolean }) {
  const t = useTranslations("Auth");
  const locale = useLocale();
  return (
    <form action={signOut}>
      <input type="hidden" name="locale" value={locale} />
      {compact ? (
        <Button
          type="submit"
          variant="ghost"
          size="icon"
          aria-label={t("signOut")}
        >
          <LogOut aria-hidden strokeWidth={1.75} />
        </Button>
      ) : (
        <Button type="submit" variant="ghost" size="row">
          <LogOut aria-hidden strokeWidth={1.75} />
          {t("signOut")}
        </Button>
      )}
    </form>
  );
}
