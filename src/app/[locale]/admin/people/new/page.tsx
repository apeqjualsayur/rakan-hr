import { ChevronLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireMember } from "@/lib/auth/member";
import { loadJobOptions } from "@/lib/people/options";
import { createClient } from "@/lib/supabase/server";
import { NewEmployeeForm } from "./NewEmployeeForm";

export async function generateMetadata() {
  const t = await getTranslations("People.new");
  return { title: t("title") };
}

// EMP-01 → EMP-03: add an employee. Owner and HR admin only (employees_insert).
export default async function NewEmployeePage() {
  await requireMember(["owner", "hr_admin"]);
  const t = await getTranslations("People.employee");
  const supabase = await createClient();
  const options = await loadJobOptions(supabase);

  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/admin/people"
        className="inline-flex min-h-11 w-fit items-center gap-1 text-label text-primary underline-offset-4 hover:underline"
      >
        <ChevronLeft aria-hidden size={20} strokeWidth={1.75} />
        {t("back")}
      </Link>
      <NewEmployeeForm {...options} />
    </div>
  );
}
