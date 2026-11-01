import { ChevronLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireMember } from "@/lib/auth/member";
import { ADMIN_ROLES, can } from "@/lib/auth/roles";
import {
  BRANCH_COLUMNS,
  normaliseHours,
  type BranchValues,
} from "@/lib/settings/branch";
import { isUuid } from "@/lib/settings/form";
import { createClient } from "@/lib/supabase/server";
import { BranchForm } from "../BranchForm";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/admin/settings/branches/[branchId]">) {
  const t = await getTranslations("Settings.branches");
  const { branchId } = await params;
  return { title: branchId === "new" ? t("newTitle") : t("editTitle") };
}

// ORG-03: one branch (or "new"). Defaults for a new branch: the company's state and
// the 100 m radius from company-config.yaml.
export default async function BranchPage({
  params,
  searchParams,
}: PageProps<"/[locale]/admin/settings/branches/[branchId]">) {
  const member = await requireMember(ADMIN_ROLES);
  const t = await getTranslations("Settings.branches");
  const { branchId } = await params;
  const { created } = await searchParams;
  const isNew = branchId === "new";
  const canManage = can(member.role, "manageBranches");
  if ((isNew && !canManage) || (!isNew && !isUuid(branchId))) notFound();

  const supabase = await createClient();
  let branch: (BranchValues & { id: string }) | null = null;
  let companyState: string | null = null;
  if (isNew) {
    const { data } = await supabase
      .from("tenants")
      .select("state_code")
      .eq("id", member.tenantId!)
      .single();
    companyState = data?.state_code ?? null;
  } else {
    const { data } = await supabase
      .from("branches")
      .select(BRANCH_COLUMNS)
      .eq("id", branchId)
      .maybeSingle<BranchValues & { id: string }>();
    if (!data) notFound();
    branch = {
      ...data,
      // numeric columns arrive as numbers or strings depending on size; normalise.
      geo_lat: data.geo_lat === null ? null : Number(data.geo_lat),
      geo_lng: data.geo_lng === null ? null : Number(data.geo_lng),
      operating_hours: normaliseHours(data.operating_hours) ?? {},
    };
  }

  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/admin/settings/branches"
        className="inline-flex min-h-11 w-fit items-center gap-1 text-label text-primary underline-offset-4 hover:underline"
      >
        <ChevronLeft aria-hidden size={20} strokeWidth={1.75} />
        {t("back")}
      </Link>
      <BranchForm
        branch={branch}
        defaultState={companyState}
        canEdit={canManage}
        justCreated={created === "1"}
      />
    </div>
  );
}
