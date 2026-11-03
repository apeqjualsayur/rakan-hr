import { getLocale, getTranslations } from "next-intl/server";
import { AttentionBanner } from "@/components/ui/AttentionBanner";
import { Card, CardHeader } from "@/components/ui/Card";
import { Link } from "@/i18n/navigation";
import { getCurrentMember } from "@/lib/auth/member";
import { inLocale } from "@/lib/policies/logic";
import { loadFeed, pendingPolicies } from "@/lib/policies/server";
import { createClient } from "@/lib/supabase/server";
import { AnnouncementFeed } from "./AnnouncementFeed";

type Area = "/admin" | "/staff";

/** POL-02 / POL-04 on home: "2 policies to sign" (renders nothing when there are none). */
export async function PoliciesBanner({ area }: { area: Area }) {
  const pending = await pendingPolicies(await createClient());
  if (pending.length === 0) return null;
  const t = await getTranslations("Policies");
  const locale = await getLocale();
  return (
    <AttentionBanner
      title={t("bannerTitle", { count: pending.length })}
      meta={pending.map((p) => inLocale(p, "title", locale)).join(" · ")}
      href={
        pending.length === 1
          ? `${area}/policies/${pending[0]!.id}`
          : area === "/staff"
            ? "/staff/policies"
            : `/admin/policies/${pending[0]!.id}`
      }
    />
  );
}

/** POL-01 on home: pinned first, the latest three; seeing them records read receipts. */
export async function AnnouncementsCard({ area }: { area: Area }) {
  const member = await getCurrentMember();
  if (!member.userId) return null;
  const t = await getTranslations("Announcements");
  const items = await loadFeed(await createClient(), member.userId, 3);
  return (
    <Card className="flex flex-col gap-2">
      <CardHeader
        title={t("title")}
        action={
          <Link
            href={`${area}/announcements`}
            className="text-label text-primary underline-offset-4 hover:underline"
          >
            {t("seeAll")}
          </Link>
        }
      />
      <AnnouncementFeed items={items} compact />
    </Card>
  );
}
