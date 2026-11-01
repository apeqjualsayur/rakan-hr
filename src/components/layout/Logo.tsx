import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

// The wordmark is the only place the name is lowercase (CLAUDE.md rule 11).
export function Logo({ href }: { href: string }) {
  const t = useTranslations("Brand");
  return (
    <Link
      href={href}
      aria-label={t("logoLabel")}
      className="flex min-h-11 items-center gap-2 rounded-control"
    >
      <span
        aria-hidden
        className="grid size-9 place-items-center rounded-control bg-primary text-lg font-bold text-white"
      >
        r
      </span>
      <span aria-hidden className="text-xl font-bold tracking-tight text-ink">
        rakan
      </span>
    </Link>
  );
}
