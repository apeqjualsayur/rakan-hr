import { Plus } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { ClaimList } from "@/components/claims/ClaimBits";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/Card";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Link } from "@/i18n/navigation";
import { requireMember } from "@/lib/auth/member";
import { STAFF_ROLES } from "@/lib/auth/roles";
import {
  CLAIM_COLUMNS,
  type Claim,
  type MyClaimType,
} from "@/lib/claims/types";
import { formatMoney } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export async function generateMetadata() {
  const t = await getTranslations("Claims");
  return { title: t("title") };
}

// CLM-01 for staff: this month's use of each limit, own claims, and New claim.
export default async function StaffClaimsPage({
  searchParams,
}: PageProps<"/[locale]/staff/claims">) {
  const member = await requireMember(STAFF_ROLES);
  const { sent } = await searchParams;
  const t = await getTranslations("Claims");
  const locale = await getLocale();
  const supabase = await createClient();
  const [{ data: types }, { data: claims }, { data: allTypes }] =
    await Promise.all([
      supabase.rpc("my_claim_types"),
      supabase
        .from("claims")
        .select(CLAIM_COLUMNS)
        .eq("employee_id", member.employeeId ?? "")
        .order("created_at", { ascending: false })
        .limit(30)
        .returns<Claim[]>(),
      supabase.from("claim_types").select("id, name_en, name_ms"),
    ]);
  const mine = (types ?? []) as MyClaimType[];
  const names = Object.fromEntries(
    (allTypes ?? []).map((x) => [
      x.id as string,
      (locale === "ms" ? x.name_ms : x.name_en) as string,
    ]),
  );

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-display-sm text-ink">{t("title")}</h1>
      {sent === "1" ? (
        <p
          role="status"
          className="rounded-tile bg-primary-tint px-4 py-3 text-meta text-primary-strong"
        >
          {t("sent")}
        </p>
      ) : null}
      {member.employeeId ? (
        <Link
          href="/staff/claims/new"
          className={cn(buttonVariants({ variant: "accent", block: true }))}
        >
          <Plus aria-hidden />
          {t("new")}
        </Link>
      ) : (
        <p className="text-body text-ink-muted">{t("notLinked")}</p>
      )}
      {mine.some((x) => x.monthly_limit) ? (
        <Card className="flex flex-col gap-4">
          <CardHeader title={t("thisMonth")} />
          {mine
            .filter((x) => x.monthly_limit)
            .map((x) => (
              <ProgressBar
                key={x.id}
                value={Number(x.claimed)}
                max={Number(x.monthly_limit)}
                label={locale === "ms" ? x.name_ms : x.name_en}
                valueLabel={t("usedOf", {
                  used: formatMoney(x.claimed),
                  limit: formatMoney(x.monthly_limit!),
                })}
              />
            ))}
        </Card>
      ) : null}
      <Card className="flex flex-col gap-2">
        <CardHeader title={t("mine")} />
        <ClaimList claims={claims ?? []} typeNames={names} />
      </Card>
    </div>
  );
}
