import { getTranslations } from "next-intl/server";
import { requireMember } from "@/lib/auth/member";
import { can } from "@/lib/auth/roles";
import {
  audienceMembers,
  audienceNames,
  loadAudienceContext,
} from "@/lib/policies/audience";
import { ANNOUNCEMENT_COLUMNS, type Announcement } from "@/lib/policies/types";
import { createClient } from "@/lib/supabase/server";
import { AnnouncementAdmin, type AdminAnnouncement } from "./AnnouncementAdmin";

export async function generateMetadata() {
  const t = await getTranslations("Announcements");
  return { title: t("title") };
}

// POL-01: write and manage announcements; read receipts per announcement.
export default async function AdminAnnouncementsPage() {
  const member = await requireMember(["owner", "hr_admin", "auditor"]);
  const t = await getTranslations("Announcements");
  const tp = await getTranslations("Policies.audience");
  const supabase = await createClient();
  const [{ data }, ctx, { data: reads }, { data: names }] = await Promise.all([
    supabase
      .from("announcements")
      .select(ANNOUNCEMENT_COLUMNS)
      .order("publish_at", { ascending: false })
      .returns<Announcement[]>(),
    loadAudienceContext(supabase),
    supabase.from("announcement_reads").select("announcement_id, user_id"),
    supabase
      .from("memberships")
      .select("user_id, invited_email, employees (full_name)"),
  ]);
  const nameOf = new Map(
    (
      (names ?? []) as unknown as {
        user_id: string | null;
        invited_email: string | null;
        employees: { full_name: string } | null;
      }[]
    )
      .filter((m) => m.user_id)
      .map((m) => [
        m.user_id!,
        m.employees?.full_name ?? m.invited_email ?? "—",
      ]),
  );
  const now = new Date().toISOString();
  const rows: AdminAnnouncement[] = (data ?? []).map((a) => ({
    ...a,
    scheduled: a.publish_at > now,
    audienceLabel: audienceNames(a.audience, ctx) ?? tp("all"),
    audienceSize: audienceMembers(a.audience, ctx).length,
    readers: (reads ?? [])
      .filter((r) => r.announcement_id === a.id)
      .map((r) => nameOf.get(r.user_id as string) ?? "—"),
  }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-display-sm text-ink md:text-display">
          {t("title")}
        </h1>
        <p className="max-w-3xl text-body text-ink-muted">{t("intro")}</p>
      </div>
      <AnnouncementAdmin
        announcements={rows}
        branches={ctx.branches}
        roles={ctx.roles}
        canEdit={can(member.role, "editPeople")}
      />
    </div>
  );
}
