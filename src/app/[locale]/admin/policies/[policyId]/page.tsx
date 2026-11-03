import { getTranslations } from "next-intl/server";
import { PolicySignView } from "@/components/policies/PolicySignView";
import { requireMember } from "@/lib/auth/member";
import { ADMIN_ROLES } from "@/lib/auth/roles";

export async function generateMetadata() {
  const t = await getTranslations("Policies");
  return { title: t("title") };
}

// POL-03 for people in the admin shell (policy notifications link here for them).
export default async function AdminPolicyPage({
  params,
}: PageProps<"/[locale]/admin/policies/[policyId]">) {
  const member = await requireMember(ADMIN_ROLES);
  const { policyId } = await params;
  return (
    <div className="mx-auto w-full max-w-3xl">
      <PolicySignView member={member} policyId={policyId} doneHref="/admin" />
    </div>
  );
}
