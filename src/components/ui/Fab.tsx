import { Plus } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

// §4 FAB: accent pill, "+" icon + label, bottom-right above the bottom nav.
// Only on list screens with one "add" action; it is that screen's single accent.
export function Fab({
  label,
  href,
  className,
}: {
  label: string;
  href: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "fixed right-4 bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] z-20 inline-flex h-14 items-center gap-2 rounded-full bg-accent px-6 text-body font-bold text-white shadow-fab transition-colors hover:bg-accent-hover active:bg-accent-strong md:right-8",
        className,
      )}
    >
      <Plus aria-hidden size={24} strokeWidth={2.25} />
      {label}
    </Link>
  );
}
