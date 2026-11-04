import { ChevronLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireMember } from "@/lib/auth/member";
import { can } from "@/lib/auth/roles";
import { TEMPLATE_COLUMNS, type LetterTemplate } from "@/lib/hiring/types";
import { isUuid } from "@/lib/settings/form";
import { createClient } from "@/lib/supabase/server";
import { TemplateEditor } from "./TemplateEditor";

export async function generateMetadata() {
  const t = await getTranslations("Settings.nav");
  return { title: t("letters") };
}

export default async function LetterTemplatePage({
  params,
}: PageProps<"/[locale]/admin/settings/letters/[templateId]">) {
  const member = await requireMember(["owner", "hr_admin", "auditor"]);
  const { templateId } = await params;
  if (!isUuid(templateId)) notFound();
  const t = await getTranslations("Letters");
  const supabase = await createClient();
  const { data: template } = await supabase
    .from("letter_templates")
    .select(TEMPLATE_COLUMNS)
    .eq("id", templateId)
    .maybeSingle<LetterTemplate>();
  if (!template) notFound();
  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/admin/settings/letters"
        className="inline-flex min-h-11 w-fit items-center gap-1 text-label text-primary underline-offset-4 hover:underline"
      >
        <ChevronLeft aria-hidden size={20} strokeWidth={1.75} />
        {t("back")}
      </Link>
      <h2 className="text-h2 text-ink">
        {t(`kinds.${template.kind}`)} · {t(`locales.${template.locale}`)}
      </h2>
      <TemplateEditor
        template={template}
        canEdit={can(member.role, "manageHiring")}
      />
    </div>
  );
}
