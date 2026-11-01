// Settings > Users: memberships seen as people with a role. Inviting inserts a membership
// with invited_email; the person is linked to it when they first sign in (Step 3).
import { APP_ROLES, type AppRole } from "@/lib/auth/roles";
import { done, isUuid, type FieldErrors, type Parsed } from "./form";

export type MemberRow = {
  id: string;
  user_id: string | null;
  invited_email: string | null;
  role: AppRole;
  branch_ids: string[];
  is_active: boolean;
  invite_sent_at: string | null;
  invite_error: string | null;
  created_at: string;
};

export const MEMBER_COLUMNS =
  "id, user_id, invited_email, role, branch_ids, is_active, invite_sent_at, invite_error, created_at";

export type MemberStatus = "invited" | "active" | "deactivated";

export function memberStatus(
  row: Pick<MemberRow, "user_id" | "is_active">,
): MemberStatus {
  if (!row.is_active) return "deactivated";
  return row.user_id ? "active" : "invited";
}

/** Active people first, then pending invites, then deactivated; oldest first within each. */
export function sortMembers(rows: readonly MemberRow[]) {
  const rank: Record<MemberStatus, number> = {
    active: 0,
    invited: 1,
    deactivated: 2,
  };
  return rows.toSorted(
    (a, b) =>
      rank[memberStatus(a)] - rank[memberStatus(b)] ||
      a.created_at.localeCompare(b.created_at),
  );
}

export function isAppRole(value: unknown): value is AppRole {
  return (APP_ROLES as readonly unknown[]).includes(value);
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type RoleValues = { role: AppRole; branch_ids: string[] };

/** Role plus manager branch scope (memberships.branch_ids; only kept for managers). */
export function parseRole(formData: FormData, errors: FieldErrors): RoleValues {
  const role = formData.get("role");
  if (!isAppRole(role)) errors.role = "invalidRole";
  const branch_ids =
    role === "manager" ? formData.getAll("branch_ids").filter(isUuid) : [];
  return { role: isAppRole(role) ? role : "staff", branch_ids };
}

export function parseInvite(
  formData: FormData,
): Parsed<RoleValues & { email: string }> {
  const errors: FieldErrors = {};
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  if (!EMAIL.test(email) || email.length > 254) errors.email = "invalidEmail";
  return done({ email, ...parseRole(formData, errors) }, errors);
}
