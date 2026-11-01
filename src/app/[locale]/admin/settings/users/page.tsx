import { getTranslations } from "next-intl/server";
import { requireMember } from "@/lib/auth/member";
import { can } from "@/lib/auth/roles";
import {
  MEMBER_COLUMNS,
  sortMembers,
  type MemberRow,
} from "@/lib/settings/members";
import { createClient } from "@/lib/supabase/server";
import { InviteForm } from "./InviteForm";
import { MemberList } from "./MemberList";

export async function generateMetadata() {
  const t = await getTranslations("Settings.users");
  return { title: t("title") };
}

// Settings > Users: owner invites and manages; HR admin and auditor can view the list.
export default async function UsersPage() {
  const member = await requireMember(["owner", "hr_admin", "auditor"]);
  const supabase = await createClient();
  const [{ data: rows }, { data: branches }] = await Promise.all([
    supabase.from("memberships").select(MEMBER_COLUMNS).returns<MemberRow[]>(),
    supabase.from("branches").select("id, name").order("created_at"),
  ]);
  const canManage = can(member.role, "manageUsers");
  const branchOptions = (branches ?? []).map((b) => ({
    id: b.id as string,
    name: (b.name as string | null) ?? "",
  }));

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <MemberList
        members={sortMembers(rows ?? [])}
        branches={branchOptions}
        currentMembershipId={member.membershipId}
        canManage={canManage}
      />
      {canManage ? <InviteForm branches={branchOptions} /> : null}
    </div>
  );
}
