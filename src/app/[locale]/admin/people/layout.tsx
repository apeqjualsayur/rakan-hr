import { getTranslations } from "next-intl/server";
import { PeopleNav, type PeopleSection } from "@/components/people/PeopleNav";
import { requireMember } from "@/lib/auth/member";
import { ADMIN_ROLES, can } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";

// People (Step 5, EMP-01 → EMP-09): the people list and employee records, the directory,
// the org chart and the change request queue. The admin layout guards sign-in and MFA.
export default async function PeopleLayout({
  children,
}: LayoutProps<"/[locale]/admin/people">) {
  const member = await requireMember(ADMIN_ROLES);
  const t = await getTranslations("People");
  const showRequests = can(member.role, "viewChanges");

  let pending = 0;
  if (showRequests) {
    const supabase = await createClient();
    const { count } = await supabase
      .from("profile_change_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending");
    pending = count ?? 0;
  }

  const sections: PeopleSection[] = [
    "list",
    "directory",
    "orgChart",
    ...(showRequests ? (["requests"] as const) : []),
  ];
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-display-sm text-ink md:text-display">
          {t("title")}
        </h1>
        <p className="max-w-3xl text-body text-ink-muted">{t("intro")}</p>
      </div>
      <PeopleNav sections={sections} pendingRequests={pending} />
      {children}
    </div>
  );
}
