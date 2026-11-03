import { ChevronLeft } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { CredentialForm } from "@/components/credentials/CredentialForm";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Link } from "@/i18n/navigation";
import { requireMember } from "@/lib/auth/member";
import { STAFF_ROLES } from "@/lib/auth/roles";
import { typeName } from "@/lib/credentials/logic";
import { loadTypes } from "@/lib/credentials/server";
import {
  CREDENTIAL_COLUMNS,
  type StaffCredential,
} from "@/lib/credentials/types";
import { isUuid } from "@/lib/settings/form";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata() {
  const t = await getTranslations("Credentials.form");
  return { title: t("titleNew") };
}

// CRD-05 add / renew (?type=…&renew=…), CRD-08 edit while pending (?edit=…).
export default async function NewCredentialPage({
  searchParams,
}: PageProps<"/[locale]/staff/credentials/new">) {
  const member = await requireMember(STAFF_ROLES);
  const t = await getTranslations("Credentials");
  const locale = await getLocale();
  const { type, renew, edit } = await searchParams;
  if (!member.employeeId) {
    const tm = await getTranslations("People.me");
    return (
      <Card>
        <EmptyState message={tm("notLinked")} />
      </Card>
    );
  }

  const supabase = await createClient();
  const types = await loadTypes(supabase);
  const lookup = async (id: unknown) =>
    isUuid(id)
      ? (
          await supabase
            .from("staff_credentials")
            .select(CREDENTIAL_COLUMNS)
            .eq("id", id)
            .eq("employee_id", member.employeeId!)
            .maybeSingle<StaffCredential>()
        ).data
      : null;
  const [existing, renewed] = await Promise.all([lookup(edit), lookup(renew)]);
  const editable =
    existing && ["draft", "pending"].includes(existing.status)
      ? existing
      : null;
  const typeId =
    editable?.credential_type_id ??
    renewed?.credential_type_id ??
    (isUuid(type) ? type : undefined);
  const chosen = types.find((x) => x.id === typeId);

  const title =
    editable && chosen
      ? t("form.titleEdit", { name: typeName(chosen, locale) })
      : renewed && chosen
        ? t("form.titleRenew", { name: typeName(chosen, locale) })
        : t("form.titleNew");

  return (
    <div className="flex flex-col gap-4">
      <Link
        href={
          editable ? `/staff/credentials/${editable.id}` : "/staff/credentials"
        }
        className="inline-flex min-h-11 w-fit items-center gap-1 text-label text-primary underline-offset-4 hover:underline"
      >
        <ChevronLeft aria-hidden size={20} strokeWidth={1.75} />
        {t("detail.back")}
      </Link>
      <h1 className="text-display-sm text-ink">{title}</h1>
      <CredentialForm
        types={types}
        initialTypeId={typeId}
        renewOf={
          renewed && renewed.status === "verified"
            ? {
                id: renewed.id,
                verified_at: renewed.verified_at,
                reference_no: renewed.reference_no,
              }
            : undefined
        }
        existing={editable ?? undefined}
        doneHref={
          editable ? `/staff/credentials/${editable.id}` : "/staff/credentials"
        }
        cancelHref={
          editable ? `/staff/credentials/${editable.id}` : "/staff/credentials"
        }
      />
    </div>
  );
}
