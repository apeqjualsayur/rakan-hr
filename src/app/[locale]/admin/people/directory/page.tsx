import { getTranslations } from "next-intl/server";
import { DirectoryView } from "@/components/people/DirectoryView";
import { requireMember } from "@/lib/auth/member";
import { ADMIN_ROLES } from "@/lib/auth/roles";
import { loadDirectory } from "@/lib/people/server";
import { isUuid } from "@/lib/settings/form";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata() {
  const t = await getTranslations("People.directory");
  return { title: t("title") };
}

// EMP-08 staff directory. `?person=<id>` opens that person's card.
export default async function DirectoryPage({
  searchParams,
}: PageProps<"/[locale]/admin/people/directory">) {
  await requireMember(ADMIN_ROLES);
  const { person } = await searchParams;
  const people = await loadDirectory(await createClient());
  return (
    <DirectoryView
      people={people}
      recordBase="/admin/people"
      initialPersonId={isUuid(person) ? person : undefined}
    />
  );
}
