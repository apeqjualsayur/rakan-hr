import type { ReactNode } from "react";
import type { AdminNavKey } from "@/components/layout/nav-items";
import { TopNav } from "@/components/ui/TopNav";

// §3.1 desktop shell: top nav + content (max 1800 px, gutter 16 mobile / 64 desktop).
export function AdminShell({
  children,
  active,
  unread,
  user,
  bell,
  account,
}: {
  children: ReactNode;
  active?: AdminNavKey;
  unread?: boolean;
  user?: { id: string; name: string };
  bell?: ReactNode;
  account?: ReactNode;
}) {
  return (
    <>
      <TopNav
        active={active}
        unread={unread}
        user={user}
        bell={bell}
        account={account}
      />
      <main className="mx-auto w-full max-w-[1800px] px-4 py-6 md:px-8 md:py-10 xl:px-16">
        {children}
      </main>
    </>
  );
}
