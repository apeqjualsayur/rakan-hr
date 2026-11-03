import { ChevronLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { OwnerActions } from "@/components/credentials/CredentialActions";
import { CredentialDetail } from "@/components/credentials/CredentialDetail";
import { Link } from "@/i18n/navigation";
import { requireMember } from "@/lib/auth/member";
import { STAFF_ROLES } from "@/lib/auth/roles";
import { loadCredentialDetail } from "@/lib/credentials/server";
import { isUuid } from "@/lib/settings/form";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata() {
  const t = await getTranslations("Credentials");
  return { title: t("title") };
}

// One of my credential records: details, files (5-minute links), history; edit or withdraw
// while pending, renew once verified.
export default async function MyCredentialPage({
  params,
}: PageProps<"/[locale]/staff/credentials/[credentialId]">) {
  const member = await requireMember(STAFF_ROLES);
  const { credentialId } = await params;
  if (!isUuid(credentialId)) notFound();
  const t = await getTranslations("Credentials.detail");
  const detail = await loadCredentialDetail(await createClient(), credentialId);
  if (!detail || detail.credential.employee_id !== member.employeeId)
    notFound();
  const c = detail.credential;
  const mine = c.submitted_by === member.userId;
  const open = c.status === "draft" || c.status === "pending";

  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/staff/credentials"
        className="inline-flex min-h-11 w-fit items-center gap-1 text-label text-primary underline-offset-4 hover:underline"
      >
        <ChevronLeft aria-hidden size={20} strokeWidth={1.75} />
        {t("back")}
      </Link>
      <CredentialDetail
        credential={c}
        type={detail.type}
        files={detail.files}
        history={detail.history}
        actions={
          <OwnerActions
            credentialId={c.id}
            canEdit={mine && open}
            canWithdraw={mine && c.status === "pending"}
            editHref={`/staff/credentials/new?edit=${c.id}`}
            renewHref={
              c.status === "verified"
                ? `/staff/credentials/new?type=${c.credential_type_id}&renew=${c.id}`
                : undefined
            }
          />
        }
      />
    </div>
  );
}
