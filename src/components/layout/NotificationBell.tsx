"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { formatDate, formatTime } from "@/lib/format";
import {
  NOTIFICATIONS_CHANGED,
  useNotificationText,
  type NotificationRow,
} from "@/lib/notifications/text";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

// FND-07 in-app bell: accent dot when unread, panel with the latest 20.
// RLS returns only the signed-in user's own notifications.
export function NotificationBell() {
  const t = useTranslations("Notifications");
  const tNav = useTranslations("AdminNav");
  const locale = useLocale();
  const text = useNotificationText();
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationRow[]>();
  const [failed, setFailed] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async (withList: boolean) => {
    const supabase = createClient();
    const { count } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .is("read_at", null);
    setUnread(count ?? 0);
    if (!withList) return;
    const { data, error } = await supabase
      .from("notifications")
      .select("id, template, data, title, body, link, read_at, created_at")
      .order("created_at", { ascending: false })
      .limit(20);
    setFailed(Boolean(error));
    setItems((data as NotificationRow[] | null) ?? []);
  }, []);

  useEffect(() => {
    const update = () => void refresh(open);
    update();
    window.addEventListener(NOTIFICATIONS_CHANGED, update);
    window.addEventListener("focus", update);
    return () => {
      window.removeEventListener(NOTIFICATIONS_CHANGED, update);
      window.removeEventListener("focus", update);
    };
  }, [open, refresh]);

  // Close on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) =>
      event.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function markRead(ids?: string[]) {
    const query = createClient()
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .is("read_at", null);
    await (ids ? query.in("id", ids) : query);
    void refresh(true);
  }

  return (
    <div ref={wrapper} className="relative">
      <button
        type="button"
        aria-label={
          unread ? tNav("notificationsUnread") : tNav("notifications")
        }
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((value) => !value)}
        className="relative grid size-12 place-items-center rounded-full border border-border bg-surface text-ink-soft transition-colors hover:bg-canvas"
      >
        <Bell aria-hidden size={20} strokeWidth={1.75} />
        {unread ? (
          <span
            aria-hidden
            className="absolute top-2.5 right-3 size-2.5 rounded-full bg-accent ring-2 ring-surface"
          />
        ) : null}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label={t("title")}
          className="absolute right-0 z-40 mt-2 flex max-h-[70dvh] w-[min(22rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-card border border-border bg-surface"
        >
          <div className="flex items-center justify-between gap-2 border-b border-border px-5 py-3">
            <h2 className="text-h3 text-ink">{t("title")}</h2>
            {unread ? (
              <Button variant="link" onClick={() => void markRead()}>
                {t("markAllRead")}
              </Button>
            ) : null}
          </div>
          <ul className="overflow-y-auto">
            {failed ? (
              <li className="px-5 py-6 text-meta text-danger">
                {t("loadError")}
              </li>
            ) : items?.length === 0 ? (
              <li className="px-5 py-6 text-meta text-ink-muted">
                {t("empty")}
              </li>
            ) : (
              items?.map((n) => {
                const { title, body } = text(n);
                const at = new Date(n.created_at);
                return (
                  <li
                    key={n.id}
                    className="border-b border-border last:border-b-0"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        if (!n.read_at) void markRead([n.id]);
                        if (n.link) window.location.assign(n.link);
                      }}
                      className={cn(
                        "flex w-full flex-col gap-1 px-5 py-3 text-left transition-colors hover:bg-canvas",
                        !n.read_at && "bg-primary-tint/40",
                      )}
                    >
                      <span className="flex items-start gap-2">
                        {!n.read_at ? (
                          <span
                            aria-hidden
                            className="mt-2 size-2 shrink-0 rounded-full bg-accent"
                          />
                        ) : null}
                        <span className="text-body font-semibold text-ink">
                          {title}
                        </span>
                      </span>
                      {body ? (
                        <span className="text-meta text-ink-soft">{body}</span>
                      ) : null}
                      <span className="text-meta text-ink-muted">
                        {formatDate(at, locale, "short")} ·{" "}
                        {formatTime(at, locale)}
                      </span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
