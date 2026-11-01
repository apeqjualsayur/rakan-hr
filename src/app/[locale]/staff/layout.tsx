import { BottomNav } from "@/components/layout/BottomNav";
import { LanguageToggle } from "@/components/layout/LanguageToggle";
import { Logo } from "@/components/layout/Logo";

// Placeholder mobile shell for staff. Role-based access is added in build step 3.
export default function StaffLayout({
  children,
}: LayoutProps<"/[locale]/staff">) {
  return (
    <>
      <header className="mx-auto flex max-w-lg items-center justify-between px-4 pt-[max(env(safe-area-inset-top),12px)] pb-2">
        <Logo href="/staff" />
        <LanguageToggle />
      </header>
      <main className="mx-auto w-full max-w-lg px-4 pb-[calc(env(safe-area-inset-bottom)+88px)]">
        {children}
      </main>
      <BottomNav />
    </>
  );
}
