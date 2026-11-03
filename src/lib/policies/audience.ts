import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Audience } from "./logic";

// Who an audience reaches, for read-receipt and tracker counts on admin screens.
// Mirrors public.audience_includes(); the database stays the source of truth for access.

export type AudienceContext = {
  branches: { id: string; name: string }[];
  roles: { id: string; name: string }[];
  /** Active members with an account, and their employee's branch / job role. */
  members: {
    user_id: string;
    branch_id: string | null;
    job_role_id: string | null;
  }[];
};

export async function loadAudienceContext(
  supabase: SupabaseClient,
): Promise<AudienceContext> {
  const [{ data: branches }, { data: roles }, { data: members }] =
    await Promise.all([
      supabase.from("branches").select("id, name").order("created_at"),
      supabase.from("job_roles").select("id, name").order("sort_order"),
      supabase
        .from("memberships")
        .select("user_id, employees (branch_id, job_role_id)")
        .eq("is_active", true)
        .not("user_id", "is", null),
    ]);
  return {
    branches: (branches ?? []).map((b) => ({
      id: b.id as string,
      name: (b.name as string | null) ?? "—",
    })),
    roles: (roles ?? []).map((r) => ({
      id: r.id as string,
      name: r.name as string,
    })),
    members: (
      (members ?? []) as unknown as {
        user_id: string;
        employees: {
          branch_id: string | null;
          job_role_id: string | null;
        } | null;
      }[]
    ).map((m) => ({
      user_id: m.user_id,
      branch_id: m.employees?.branch_id ?? null,
      job_role_id: m.employees?.job_role_id ?? null,
    })),
  };
}

export function audienceMembers(audience: Audience, ctx: AudienceContext) {
  return ctx.members.filter((m) =>
    audience.type === "all"
      ? true
      : audience.type === "branches"
        ? m.branch_id !== null && audience.ids.includes(m.branch_id)
        : m.job_role_id !== null && audience.ids.includes(m.job_role_id),
  );
}

/** "Everyone" or the chosen names, joined. */
export function audienceNames(audience: Audience, ctx: AudienceContext) {
  if (audience.type === "all") return null;
  const list = audience.type === "branches" ? ctx.branches : ctx.roles;
  return list
    .filter((x) => audience.ids.includes(x.id))
    .map((x) => x.name)
    .join(", ");
}
