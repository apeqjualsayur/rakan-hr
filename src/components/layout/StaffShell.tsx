import type { ReactNode } from "react";
import { LanguageToggle } from "@/components/layout/LanguageToggle";
import type { StaffNavKey } from "@/components/layout/nav-items";
import { BottomNav } from "@/components/ui/BottomNav";

// §3.2 mobile shell: canvas, 16 px gutter, bottom nav with safe-area padding.
// The language toggle (and, when signed in, the bell and sign-out passed as `actions`)
// sit top-right until the "Me" screen exists to hold them.
export function StaffShell({
  children,
  active,
  actions,
}: {
  children: ReactNode;
  active?: StaffNavKey;
  actions?: ReactNode;
}) {
  return (
    <>
      <div className="mx-auto flex max-w-lg items-center justify-end gap-2 px-4 pt-[max(env(safe-area-inset-top),8px)]">
        <LanguageToggle />
        {actions}
      </div>
      <main className="mx-auto w-full max-w-lg px-4 pt-2 pb-[calc(env(safe-area-inset-bottom)+6rem)]">
        {children}
      </main>
      <BottomNav active={active} />
    </>
  );
}
