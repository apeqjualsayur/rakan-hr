import { ChevronLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireMember } from "@/lib/auth/member";
import { createClient } from "@/lib/supabase/server";
import { OpeningForm } from "../OpeningForm";

export async function generateMetadata() {
  const t = await getTranslations("Hiring.openings");
  return { title: t("newTitle") };
}

export default async function NewOpeningPage() {
  await requireMember(["owner", "hr_admin"]);
  const t = await getTranslations("Hiring.openings");
  const supabase = await createClient();
  const [{ data: roles }, { data: branches }] = await Promise.all([
    supabase.from("job_roles").select("id, name").order("sort_order"),
    supabase.from("branches").select("id, name").order("created_at"),
  ]);
  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/admin/hiring/openings"
        className="inline-flex min-h-11 w-fit items-center gap-1 text-label text-primary underline-offset-4 hover:underline"
      >
        <ChevronLeft aria-hidden size={20} strokeWidth={1.75} />
        {t("back")}
      </Link>
      <h2 className="text-h2 text-ink">{t("newTitle")}</h2>
      <OpeningForm
        roles={(roles ?? []) as { id: string; name: string }[]}
        branches={(branches ?? []) as { id: string; name: string | null }[]}
        canEdit
      />
    </div>
  );
}
