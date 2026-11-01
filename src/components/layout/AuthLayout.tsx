import type { ReactNode } from "react";
import { LanguageToggle } from "@/components/layout/LanguageToggle";
import { Logo } from "@/components/layout/Logo";
import { Card } from "@/components/ui/Card";

// Centred single-card layout for login, MFA and no-access screens (mobile-first).
export function AuthLayout({
  title,
  intro,
  children,
}: {
  title: ReactNode;
  intro?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pt-[max(env(safe-area-inset-top),12px)] pb-10">
      <header className="flex items-center justify-between py-3">
        <Logo href="/" />
        <LanguageToggle />
      </header>
      <main className="flex flex-1 flex-col justify-center py-6">
        <Card className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <h1 className="text-h2 text-ink">{title}</h1>
            {intro ? <p className="text-body text-ink-muted">{intro}</p> : null}
          </div>
          {children}
        </Card>
      </main>
    </div>
  );
}

/** Suspense fallback while the session is read. */
export function AuthLoading({ label }: { label: string }) {
  return (
    <div className="grid min-h-dvh place-items-center px-4">
      <p role="status" className="text-body text-ink-muted">
        {label}
      </p>
    </div>
  );
}
