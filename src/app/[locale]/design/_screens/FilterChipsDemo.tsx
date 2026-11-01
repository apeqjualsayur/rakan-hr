"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { FilterChips } from "@/components/ui/FilterChips";

export function FilterChipsDemo() {
  const t = useTranslations("Demo.credentials");
  const [value, setValue] = useState<"all" | "actionNeeded" | "valid">(
    "actionNeeded",
  );
  return (
    <FilterChips
      label={t("filterLabel")}
      value={value}
      onChange={setValue}
      chips={[
        { value: "all", label: t("all"), count: 6 },
        { value: "actionNeeded", label: t("actionNeeded"), count: 2 },
        { value: "valid", label: t("valid"), count: 2 },
      ]}
    />
  );
}
