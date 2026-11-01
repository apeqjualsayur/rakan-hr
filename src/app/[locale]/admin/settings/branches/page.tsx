import { Clock, MapPin, Plus } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Link } from "@/i18n/navigation";
import { requireMember } from "@/lib/auth/member";
import { ADMIN_ROLES, can } from "@/lib/auth/roles";
import { formatClock } from "@/lib/format";
import { stateName } from "@/lib/malaysia";
import {
  BRANCH_COLUMNS,
  normaliseHours,
  summariseHours,
} from "@/lib/settings/branch";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata() {
  const t = await getTranslations("Settings.branches");
  return { title: t("title") };
}

type BranchRow = {
  id: string;
  name: string | null;
  address: string | null;
  state_code: string | null;
  geo_lat: number | null;
  geo_lng: number | null;
  geo_radius_m: number | null;
  operating_hours: unknown;
};

// ORG-03 branch list. Each row says what is still missing (geofence, hours).
export default async function BranchesPage() {
  const member = await requireMember(ADMIN_ROLES);
  const t = await getTranslations("Settings.branches");
  const locale = await getLocale();
  const supabase = await createClient();
  const { data } = await supabase
    .from("branches")
    .select(BRANCH_COLUMNS)
    .order("created_at")
    .returns<BranchRow[]>();
  const branches = data ?? [];
  const canManage = can(member.role, "manageBranches");

  return (
    <Card className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-h2 text-ink">{t("title")}</h2>
          <p className="text-meta text-ink-muted">{t("intro")}</p>
        </div>
        {canManage ? (
          <Button asChild variant="outline">
            <Link href="/admin/settings/branches/new">
              <Plus aria-hidden />
              {t("add")}
            </Link>
          </Button>
        ) : null}
      </div>

      {branches.length === 0 ? (
        <EmptyState message={t("empty")} />
      ) : (
        <ul className="divide-y divide-border border-t border-border">
          {branches.map((b) => {
            const hours = summariseHours(
              normaliseHours(b.operating_hours) ?? {},
              (d) => t(`daysShort.${d}`),
              (hhmm) => formatClock(hhmm, locale),
            );
            const hasPin = b.geo_lat !== null && b.geo_lng !== null;
            return (
              <li
                key={b.id}
                className="flex flex-col gap-3 py-4 md:flex-row md:items-center md:justify-between md:gap-8"
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <p className="text-h3 text-ink">{b.name ?? t("unnamed")}</p>
                  <p className="text-meta text-ink-muted">
                    {[b.address, stateName(b.state_code)]
                      .filter(Boolean)
                      .join(" · ") || t("noAddress")}
                  </p>
                  <p
                    className={
                      hasPin
                        ? "flex items-center gap-1.5 text-meta text-ink-muted"
                        : "flex items-center gap-1.5 text-meta font-medium text-warning"
                    }
                  >
                    <MapPin aria-hidden size={16} strokeWidth={1.75} />
                    {hasPin
                      ? t("geofenceSet", { radius: b.geo_radius_m ?? 0 })
                      : t("geofenceMissing")}
                  </p>
                  <p
                    className={
                      hours
                        ? "flex items-center gap-1.5 text-meta text-ink-muted"
                        : "flex items-center gap-1.5 text-meta font-medium text-warning"
                    }
                  >
                    <Clock aria-hidden size={16} strokeWidth={1.75} />
                    {hours || t("hoursMissing")}
                  </p>
                </div>
                <Button asChild variant="outline" size="row">
                  <Link href={`/admin/settings/branches/${b.id}`}>
                    {canManage ? t("edit") : t("view")}
                  </Link>
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
