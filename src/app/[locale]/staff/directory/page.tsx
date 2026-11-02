import { getTranslations } from "next-intl/server";
import { DirectoryView } from "@/components/people/DirectoryView";
import { requireMember } from "@/lib/auth/member";
import { STAFF_ROLES } from "@/lib/auth/roles";
import { loadDirectory } from "@/lib/people/server";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata() {
  const t = await getTranslations("People.directory");
  return { title: t("title") };
}

// EMP-08 directory for staff and managers: work contact details only (v_directory).
export default async function StaffDirectoryPage() {
  await requireMember(STAFF_ROLES);
  const t = await getTranslations("People.directory");
  const people = await loadDirectory(await createClient());
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-display-sm text-ink">{t("title")}</h1>
        <p className="text-meta text-ink-muted">{t("intro")}</p>
      </div>
      <DirectoryView people={people} />
    </div>
  );
}
