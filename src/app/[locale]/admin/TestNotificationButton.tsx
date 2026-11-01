"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { NOTIFICATIONS_CHANGED } from "@/lib/notifications/text";
import { createClient } from "@/lib/supabase/client";

// Step 3 check ("Bell icon shows a test notification"). Calls send_test_notification(),
// which can only notify the caller. Shown in development only.
export function TestNotificationButton() {
  const t = useTranslations("Notifications");
  const [message, setMessage] = useState<{ ok: boolean; text: string }>();
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        variant="outline"
        loading={pending}
        onClick={() =>
          startTransition(async () => {
            const { error } = await createClient().rpc(
              "send_test_notification",
            );
            setMessage(
              error
                ? { ok: false, text: t("testFailed") }
                : { ok: true, text: t("testSent") },
            );
            window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));
          })
        }
      >
        {t("sendTest")}
      </Button>
      {message ? (
        <p
          role="status"
          className={
            message.ok
              ? "text-meta text-ink-muted"
              : "text-meta font-medium text-danger"
          }
        >
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
