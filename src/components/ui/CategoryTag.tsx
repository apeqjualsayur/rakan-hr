import { useTranslations } from "next-intl";
import { categoryTones, toneClasses, type Category } from "@/lib/status-styles";
import { cn } from "@/lib/utils";

// §4 Category tag: pill, label text, tint background + dark text of the same family.
export function CategoryTag({
  category,
  className,
}: {
  category: Category;
  className?: string;
}) {
  const t = useTranslations("Category");
  return (
    <span
      className={cn(
        "inline-flex min-h-8 items-center justify-center rounded-full px-3 py-1 text-center text-label",
        toneClasses[categoryTones[category]],
        className,
      )}
    >
      {t(category)}
    </span>
  );
}
