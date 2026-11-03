"use client";

import { useLocale, useTranslations } from "next-intl";

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
  const locale = useLocale();

  const entity = (type: unknown) =>
    typeof type === "string" && t.has(`entity.${type}` as "entity.test")
      ? t(`entity.${type}` as "entity.test")
      : t("entity.fallback");

  const typeName = (d: Record<string, unknown>) =>
    String(
      (locale === "ms" ? d.type_name_ms : d.type_name_en) ?? d.type_code ?? "",
    );

  const localTitle = (d: Record<string, unknown>) =>
    String((locale === "ms" ? d.title_ms : d.title_en) ?? "");

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
      // Step 6 credential reminders: data.for_hr picks the HR version.
      case "credential_expiring": {
        const type = typeName(d);
        const days = Number(d.days_left ?? 0);
        const hr = d.for_hr === true;
        const name = String(d.employee_name ?? "");
        return {
          title:
            days === 0
              ? hr
                ? t("templates.credential_expiring.titleHrToday", {
                    name,
                    type,
                  })
                : t("templates.credential_expiring.titleToday", { type })
              : hr
                ? t("templates.credential_expiring.titleHr", {
                    name,
                    type,
                    days,
                  })
                : t("templates.credential_expiring.title", { type, days }),
          body: hr
            ? t("templates.credential_expiring.bodyHr")
            : t("templates.credential_expiring.body"),
        };
      }
      case "credential_expired": {
        const type = typeName(d);
        const hr = d.for_hr === true;
        return {
          title: hr
            ? t("templates.credential_expired.titleHr", {
                name: String(d.employee_name ?? ""),
                type,
              })
            : t("templates.credential_expired.title", { type }),
          body: hr
            ? t("templates.credential_expired.bodyHr")
            : t("templates.credential_expired.body"),
        };
      }
      case "cpd_behind": {
        const type = typeName(d);
        return {
          title:
            d.for_hr === true
              ? t("templates.cpd_behind.titleHr", {
                  name: String(d.employee_name ?? ""),
                  type,
                })
              : t("templates.cpd_behind.title", { type }),
          body: t("templates.cpd_behind.body", {
            points: String(d.points ?? 0),
            target: String(d.target ?? 0),
            date: String(d.cycle_end ?? ""),
          }),
        };
      }
      // Step 7: announcements and policies (data has title_en / title_ms).
      case "announcement":
        return {
          title: t("templates.announcement.title", { title: localTitle(d) }),
          body: null,
        };
      case "policy_published":
        return {
          title: t("templates.policy_published.title", {
            title: localTitle(d),
          }),
          body: t("templates.policy_published.body", {
            version: String(d.version ?? 1),
          }),
        };
      case "policy_reminder":
        return {
          title: t("templates.policy_reminder.title", { title: localTitle(d) }),
          body: t("templates.policy_reminder.body", {
            days: String(d.days ?? 3),
          }),
        };
      case "cpd_decided":
        return {
          title:
            d.decision === "verified"
              ? t("templates.cpd_decided.approvedTitle", {
                  title: String(d.title ?? ""),
                })
              : t("templates.cpd_decided.rejectedTitle", {
                  title: String(d.title ?? ""),
                }),
          body: d.reason
            ? t("templates.cpd_decided.body", { reason: String(d.reason) })
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
