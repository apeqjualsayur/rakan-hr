import { getTranslations } from "next-intl/server";
import { ChevronLeft } from "lucide-react";
import { PolicySignView } from "@/components/policies/PolicySignView";
import { Link } from "@/i18n/navigation";
import { requireMember } from "@/lib/auth/member";
import { STAFF_ROLES } from "@/lib/auth/roles";

export async function generateMetadata() {
  const t = await getTranslations("Policies");
  return { title: t("title") };
}

// POL-03: read and sign one policy version.
export default async function StaffPolicyPage({
  params,
}: PageProps<"/[locale]/staff/policies/[policyId]">) {
  const member = await requireMember(STAFF_ROLES);
  const { policyId } = await params;
  const t = await getTranslations("Policies");
  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/staff/policies"
        className="inline-flex min-h-11 w-fit items-center gap-1 text-label text-primary underline-offset-4 hover:underline"
      >
        <ChevronLeft aria-hidden size={20} strokeWidth={1.75} />
        {t("title")}
      </Link>
      <PolicySignView
        member={member}
        policyId={policyId}
        doneHref="/staff/policies"
      />
    </div>
  );
}
