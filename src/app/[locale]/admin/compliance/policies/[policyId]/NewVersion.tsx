"use client";

import { useState, type ComponentProps } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { PublishPolicyForm } from "../PublishPolicyForm";

/** "Publish a new version" button that opens the publish form for this policy. */
export function NewVersion(
  props: Omit<ComponentProps<typeof PublishPolicyForm>, "onDone">,
) {
  const t = useTranslations("Policies.publish");
  const [open, setOpen] = useState(false);
  return open ? (
    <PublishPolicyForm {...props} onDone={() => setOpen(false)} />
  ) : (
    <Button variant="outline" className="w-fit" onClick={() => setOpen(true)}>
      {t("newVersion")}
    </Button>
  );
}
