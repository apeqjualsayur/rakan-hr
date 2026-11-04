import { ChevronLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireMember } from "@/lib/auth/member";
import { ADMIN_ROLES, can } from "@/lib/auth/roles";
import { OPENING_COLUMNS, type JobOpening } from "@/lib/hiring/types";
import { isUuid } from "@/lib/settings/form";
import { createClient } from "@/lib/supabase/server";
import { OpeningForm } from "../OpeningForm";

export async function generateMetadata() {
  const t = await getTranslations("Hiring.openings");
  return { title: t("edit") };
}

export default async function OpeningPage({
  params,
}: PageProps<"/[locale]/admin/hiring/openings/[openingId]">) {
  const member = await requireMember(ADMIN_ROLES);
  const { openingId } = await params;
  if (!isUuid(openingId)) notFound();
  const t = await getTranslations("Hiring.openings");
  const supabase = await createClient();
  const [{ data: opening }, { data: roles }, { data: branches }] =
    await Promise.all([
      supabase
        .from("job_openings")
        .select(OPENING_COLUMNS)
        .eq("id", openingId)
        .maybeSingle<JobOpening>(),
      supabase.from("job_roles").select("id, name").order("sort_order"),
      supabase.from("branches").select("id, name").order("created_at"),
    ]);
  if (!opening) notFound();
  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/admin/hiring/openings"
        className="inline-flex min-h-11 w-fit items-center gap-1 text-label text-primary underline-offset-4 hover:underline"
      >
        <ChevronLeft aria-hidden size={20} strokeWidth={1.75} />
        {t("back")}
      </Link>
      <h2 className="text-h2 text-ink">{opening.title}</h2>
      <OpeningForm
        opening={opening}
        roles={(roles ?? []) as { id: string; name: string }[]}
        branches={(branches ?? []) as { id: string; name: string | null }[]}
        canEdit={can(member.role, "manageHiring")}
      />
    </div>
  );
}
