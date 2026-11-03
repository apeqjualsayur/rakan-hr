import { ChevronLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { DecisionPanel } from "@/components/credentials/CredentialActions";
import { CredentialDetail } from "@/components/credentials/CredentialDetail";
import { Link } from "@/i18n/navigation";
import { requireMember } from "@/lib/auth/member";
import { can } from "@/lib/auth/roles";
import { loadCredentialDetail } from "@/lib/credentials/server";
import { isUuid } from "@/lib/settings/form";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata() {
  const t = await getTranslations("Compliance.review");
  return { title: t("back") };
}

// CRD-09 review: the files beside what was entered; verify (method) or reject (reason).
// Auditors may open non-restricted records read-only.
export default async function CredentialReviewPage({
  params,
}: PageProps<"/[locale]/admin/compliance/credentials/[credentialId]">) {
  const member = await requireMember(["owner", "hr_admin", "auditor"]);
  const { credentialId } = await params;
  if (!isUuid(credentialId)) notFound();
  const t = await getTranslations("Compliance.review");
  const supabase = await createClient();
  const detail = await loadCredentialDetail(supabase, credentialId);
  if (!detail) notFound();
  const c = detail.credential;
  const { data: person } = await supabase
    .from("employees")
    .select("full_name")
    .eq("id", c.employee_id)
    .maybeSingle();
  const reviewer = can(member.role, "reviewChanges");
  const own = c.employee_id === member.employeeId;

  return (
    <div className="flex flex-col gap-4">
      <Link
        href={
          c.status === "pending"
            ? "/admin/compliance/verify"
            : `/admin/people/${c.employee_id}?tab=credentials`
        }
        className="inline-flex min-h-11 w-fit items-center gap-1 text-label text-primary underline-offset-4 hover:underline"
      >
        <ChevronLeft aria-hidden size={20} strokeWidth={1.75} />
        {c.status === "pending"
          ? t("back")
          : ((person?.full_name as string | undefined) ?? t("back"))}
      </Link>
      <p className="text-h3 text-ink">
        {person?.full_name as string | undefined}
      </p>
      <CredentialDetail
        layout="split"
        credential={c}
        type={detail.type}
        files={detail.files}
        history={detail.history}
        actions={
          reviewer && c.status === "pending" ? (
            own ? (
              <p className="text-meta text-ink-muted">{t("selfNote")}</p>
            ) : (
              <DecisionPanel credentialId={c.id} />
            )
          ) : null
        }
      />
    </div>
  );
}
