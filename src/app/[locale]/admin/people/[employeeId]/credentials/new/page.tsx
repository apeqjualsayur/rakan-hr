import { ChevronLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { CredentialForm } from "@/components/credentials/CredentialForm";
import { Link } from "@/i18n/navigation";
import { requireMember } from "@/lib/auth/member";
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

// CRD-10: HR adds (or renews) a credential on someone's behalf, e.g. during onboarding.
// It then waits in Verify credentials like any other submission.
export default async function AddCredentialForEmployeePage({
  params,
  searchParams,
}: PageProps<"/[locale]/admin/people/[employeeId]/credentials/new">) {
  await requireMember(["owner", "hr_admin"]);
  const { employeeId } = await params;
  const { type, renew } = await searchParams;
  if (!isUuid(employeeId)) notFound();
  const t = await getTranslations("Credentials");
  const locale = await getLocale();
  const supabase = await createClient();
  const [{ data: person }, types, { data: renewed }] = await Promise.all([
    supabase
      .from("employees")
      .select("full_name")
      .eq("id", employeeId)
      .maybeSingle(),
    loadTypes(supabase),
    isUuid(renew)
      ? supabase
          .from("staff_credentials")
          .select(CREDENTIAL_COLUMNS)
          .eq("id", renew)
          .eq("employee_id", employeeId)
          .maybeSingle<StaffCredential>()
      : Promise.resolve({ data: null }),
  ]);
  if (!person) notFound();
  const typeId =
    renewed?.credential_type_id ?? (isUuid(type) ? type : undefined);
  const chosen = types.find((x) => x.id === typeId);
  const back = `/admin/people/${employeeId}?tab=credentials`;

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <Link
        href={back}
        className="inline-flex min-h-11 w-fit items-center gap-1 text-label text-primary underline-offset-4 hover:underline"
      >
        <ChevronLeft aria-hidden size={20} strokeWidth={1.75} />
        {person.full_name as string}
      </Link>
      <div className="flex flex-col gap-1">
        <h2 className="text-h2 text-ink">
          {renewed && chosen
            ? t("form.titleRenew", { name: typeName(chosen, locale) })
            : t("form.titleNew")}
        </h2>
        <p className="text-meta text-ink-muted">
          {t("form.forPerson", { name: person.full_name as string })}
        </p>
      </div>
      <CredentialForm
        types={types}
        employeeId={employeeId}
        initialTypeId={typeId}
        renewOf={
          renewed?.status === "verified"
            ? {
                id: renewed.id,
                verified_at: renewed.verified_at,
                reference_no: renewed.reference_no,
              }
            : undefined
        }
        doneHref={back}
        cancelHref={back}
      />
    </div>
  );
}
