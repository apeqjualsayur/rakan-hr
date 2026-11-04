import { ChevronLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireMember } from "@/lib/auth/member";
import { isUuid } from "@/lib/settings/form";
import { createClient } from "@/lib/supabase/server";
import { CandidateForm } from "../CandidateForm";

export async function generateMetadata() {
  const t = await getTranslations("Hiring.candidate");
  return { title: t("newTitle") };
}

export default async function NewCandidatePage({
  searchParams,
}: PageProps<"/[locale]/admin/hiring/candidates/new">) {
  const member = await requireMember(["owner", "hr_admin"]);
  const { opening } = await searchParams;
  const t = await getTranslations("Hiring.candidate");
  const supabase = await createClient();
  const { data: openings } = await supabase
    .from("job_openings")
    .select("id, title")
    .neq("status", "closed")
    .order("created_at", { ascending: false });
  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/admin/hiring"
        className="inline-flex min-h-11 w-fit items-center gap-1 text-label text-primary underline-offset-4 hover:underline"
      >
        <ChevronLeft aria-hidden size={20} strokeWidth={1.75} />
        {t("back")}
      </Link>
      <h2 className="text-h2 text-ink">{t("newTitle")}</h2>
      <CandidateForm
        tenantId={member.tenantId!}
        openings={(openings ?? []) as { id: string; title: string }[]}
        initialOpeningId={isUuid(opening) ? opening : undefined}
        canEdit
      />
    </div>
  );
}
