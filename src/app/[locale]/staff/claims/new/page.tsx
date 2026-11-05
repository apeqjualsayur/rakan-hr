import { ChevronLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { ClaimForm } from "@/components/claims/ClaimForm";
import { Link } from "@/i18n/navigation";
import { requireMember } from "@/lib/auth/member";
import { STAFF_ROLES } from "@/lib/auth/roles";
import type { MyClaimType } from "@/lib/claims/types";
import { malaysiaToday } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata() {
  const t = await getTranslations("Claims");
  return { title: t("new") };
}

export default async function NewClaimPage() {
  const member = await requireMember(STAFF_ROLES);
  const t = await getTranslations("Claims");
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_claim_types");
  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/staff/claims"
        className="inline-flex min-h-11 w-fit items-center gap-1 text-label text-primary underline-offset-4 hover:underline"
      >
        <ChevronLeft aria-hidden size={20} strokeWidth={1.75} />
        {t("title")}
      </Link>
      <h1 className="text-display-sm text-ink">{t("new")}</h1>
      {member.employeeId ? (
        <ClaimForm
          types={(data ?? []) as MyClaimType[]}
          tenantId={member.tenantId!}
          employeeId={member.employeeId}
          today={malaysiaToday()}
        />
      ) : (
        <p className="text-body text-ink-muted">{t("notLinked")}</p>
      )}
    </div>
  );
}
