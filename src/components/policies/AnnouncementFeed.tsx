"use client";

import { useEffect } from "react";
import { Pin } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { EmptyState } from "@/components/ui/EmptyState";
import { markAnnouncementsRead } from "@/lib/policies/actions";
import { formatDate } from "@/lib/format";
import type { Announcement } from "@/lib/policies/types";
import { cn } from "@/lib/utils";

export type FeedItem = Pick<
  Announcement,
  | "id"
  | "title_en"
  | "title_ms"
  | "body_en"
  | "body_ms"
  | "pinned"
  | "publish_at"
> & { read: boolean };

// POL-01 for readers: pinned first, newest next, in the viewer's language. Showing an
// announcement records the read receipt.
export function AnnouncementFeed({
  items,
  compact = false,
}: {
  items: readonly FeedItem[];
  /** Home-screen card: titles and a two-line preview. */
  compact?: boolean;
}) {
  const t = useTranslations("Announcements");
  const locale = useLocale();
  const unread = items
    .filter((i) => !i.read)
    .map((i) => i.id)
    .join(",");

  useEffect(() => {
    if (unread) void markAnnouncementsRead(unread.split(","));
  }, [unread]);

  if (items.length === 0)
    return <EmptyState message={t("none")} className="py-2" />;
  return (
    <ul className="divide-y divide-border">
      {items.map((a) => {
        const title = locale === "ms" ? a.title_ms : a.title_en;
        const body = locale === "ms" ? a.body_ms : a.body_en;
        return (
          <li key={a.id} className="flex flex-col gap-1 py-3">
            <div className="flex items-start gap-2">
              {!a.read ? (
                <span
                  aria-label={t("unread")}
                  className="mt-2 size-2 shrink-0 rounded-full bg-accent"
                />
              ) : null}
              <p className="min-w-0 flex-1 text-h3 text-ink">{title}</p>
              {a.pinned ? (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary-tint px-2.5 py-0.5 text-label text-primary-strong">
                  <Pin aria-hidden size={14} strokeWidth={2} />
                  {t("pinned")}
                </span>
              ) : null}
            </div>
            {body ? (
              <p
                className={cn(
                  "text-body whitespace-pre-line text-ink-soft",
                  compact && "line-clamp-2",
                )}
              >
                {body}
              </p>
            ) : null}
            <p className="text-meta text-ink-muted">
              {formatDate(new Date(a.publish_at), locale, "full")}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
