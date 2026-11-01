"use client";

import { useEffect, useRef, useState } from "react";
import { Settings } from "lucide-react";
import { useTranslations } from "next-intl";
import { SignOutButton } from "@/components/layout/SignOutButton";
import { PersonAvatar } from "@/components/ui/PersonRow";
import { Link } from "@/i18n/navigation";

// TopNav avatar: shows who is signed in, with Settings (when given) and Sign out.
export function AccountMenu({
  user,
  settingsHref,
}: {
  user: { id: string; name: string };
  settingsHref?: string;
}) {
  const t = useTranslations("AdminNav");
  const tAuth = useTranslations("Auth");
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) =>
      event.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrapper} className="relative">
      <button
        type="button"
        aria-label={t("account")}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="rounded-full"
      >
        <PersonAvatar id={user.id} name={user.name} />
      </button>
      {open ? (
        <div className="absolute right-0 z-40 mt-2 flex w-64 flex-col gap-2 rounded-card border border-border bg-surface p-4">
          <p className="text-meta break-all text-ink-muted">
            {tAuth("signedInAs", { email: user.name })}
          </p>
          {settingsHref ? (
            <Link
              href={settingsHref}
              onClick={() => setOpen(false)}
              className="flex min-h-11 items-center gap-2 rounded-control px-3 text-label text-ink-soft transition-colors hover:bg-canvas"
            >
              <Settings aria-hidden size={20} strokeWidth={1.75} />
              {t("settings")}
            </Link>
          ) : null}
          <SignOutButton />
        </div>
      ) : null}
    </div>
  );
}
