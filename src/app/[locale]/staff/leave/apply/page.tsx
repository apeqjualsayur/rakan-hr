import { ChevronLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { LeaveApplyForm } from "@/components/leave/LeaveApplyForm";
import { Link } from "@/i18n/navigation";
import { requireMember } from "@/lib/auth/member";
import { STAFF_ROLES } from "@/lib/auth/roles";
import { malaysiaToday } from "@/lib/format";
import { available } from "@/lib/leave/logic";
import { loadBalances, loadLeaveTypes } from "@/lib/leave/server";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata() {
  const t = await getTranslations("Leave");
  return { title: t("applyButton") };
}

// LVE-05: apply on the phone; the manager is asked to approve.
export default async function ApplyLeavePage() {
  const member = await requireMember(STAFF_ROLES);
  const t = await getTranslations("Leave");
  const supabase = await createClient();
  const year = Number(malaysiaToday().slice(0, 4));
  const [types, balances, { data: me }] = await Promise.all([
    loadLeaveTypes(supabase),
    member.employeeId
      ? loadBalances(supabase, year, member.employeeId)
      : Promise.resolve([]),
    member.employeeId
      ? supabase
          .from("employees")
          .select("gender")
          .eq("id", member.employeeId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const usable = types.filter((x) => !x.gender || x.gender === me?.gender);
  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/staff/leave"
        className="inline-flex min-h-11 w-fit items-center gap-1 text-label text-primary underline-offset-4 hover:underline"
      >
        <ChevronLeft aria-hidden size={20} strokeWidth={1.75} />
        {t("title")}
      </Link>
      <h1 className="text-display-sm text-ink">{t("applyButton")}</h1>
      {member.employeeId ? (
        <LeaveApplyForm
          types={usable}
          available={Object.fromEntries(
            balances.map((b) => [b.leave_type_id, available(b)]),
          )}
          tenantId={member.tenantId!}
          employeeId={member.employeeId}
        />
      ) : (
        <p className="text-body text-ink-muted">{t("notLinked")}</p>
      )}
    </div>
  );
}
