import { getTranslations } from "next-intl/server";
import { AnnouncementFeed } from "@/components/policies/AnnouncementFeed";
import { Card } from "@/components/ui/Card";
import { requireMember } from "@/lib/auth/member";
import { STAFF_ROLES } from "@/lib/auth/roles";
import { loadFeed } from "@/lib/policies/server";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata() {
  const t = await getTranslations("Announcements");
  return { title: t("title") };
}

// POL-01: every announcement addressed to me; viewing them records the read receipt.
export default async function StaffAnnouncementsPage() {
  const member = await requireMember(STAFF_ROLES);
  const t = await getTranslations("Announcements");
  const items = await loadFeed(await createClient(), member.userId!);
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-display-sm text-ink">{t("title")}</h1>
      <Card>
        <AnnouncementFeed items={items} />
      </Card>
    </div>
  );
}
