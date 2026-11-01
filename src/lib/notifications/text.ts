"use client";

import { useTranslations } from "next-intl";

export type NotificationRow = {
  id: string;
  template: string;
  data: Record<string, unknown>;
  title: string | null;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

/** Window event that tells the bell to refetch (e.g. after "Send test notification"). */
export const NOTIFICATIONS_CHANGED = "rakan:notifications-changed";

// Renders a notification in the viewer's current language from its template + data
// (public.notify() stores the template key, not text). Template keys match
// supabase/functions/_shared/emails/templates.ts.
export function useNotificationText() {
  const t = useTranslations("Notifications");

  const entity = (type: unknown) =>
    typeof type === "string" && t.has(`entity.${type}` as "entity.test")
      ? t(`entity.${type}` as "entity.test")
      : t("entity.fallback");

  return (n: NotificationRow): { title: string; body: string | null } => {
    const d = n.data ?? {};
    switch (n.template) {
      case "test":
        return {
          title: t("templates.test.title"),
          body: t("templates.test.body"),
        };
      case "approval_requested":
        return {
          title: t("templates.approval_requested.title"),
          body: t("templates.approval_requested.body", {
            entity: entity(d.entity_type),
            step: String(d.step_no ?? 1),
          }),
        };
      case "approval_decided":
        return {
          title:
            d.decision === "approved"
              ? t("templates.approval_decided.approvedTitle", {
                  entity: entity(d.entity_type),
                })
              : t("templates.approval_decided.rejectedTitle", {
                  entity: entity(d.entity_type),
                }),
          body: d.comment
            ? t("templates.approval_decided.body", {
                comment: String(d.comment),
              })
            : null,
        };
      default:
        return {
          title: n.title ?? t("templates.fallback.title"),
          body: n.body,
        };
    }
  };
}
