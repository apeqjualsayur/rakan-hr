import "server-only";
import { cache } from "react";
import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { guardRedirect, type AppRole, type MemberState } from "./roles";

export type CurrentMember = MemberState & {
  userId: string | null;
  email: string | null;
  membershipId: string | null;
  tenantId: string | null;
  employeeId: string | null;
};

const signedOut: CurrentMember = {
  signedIn: false,
  role: null,
  aal: null,
  hasMfaFactor: false,
  userId: null,
  email: null,
  membershipId: null,
  tenantId: null,
  employeeId: null,
};

// The signed-in user, their active membership (FND-01) and MFA state.
// Reads cookies, so callers must sit behind <Suspense> (Cache Components).
// React `cache` dedupes it within one request.
export const getCurrentMember = cache(async (): Promise<CurrentMember> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims) return signedOut;

  const [{ data: membership }, { data: assurance }] = await Promise.all([
    // RLS lets everyone read their own membership, even before MFA.
    supabase
      .from("memberships")
      .select("id, tenant_id, role, employee_id")
      .eq("user_id", claims.sub)
      .eq("is_active", true)
      .maybeSingle(),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
  ]);

  return {
    signedIn: true,
    userId: claims.sub,
    email: typeof claims.email === "string" ? claims.email : null,
    role: (membership?.role as AppRole | undefined) ?? null,
    membershipId: membership?.id ?? null,
    tenantId: membership?.tenant_id ?? null,
    employeeId: membership?.employee_id ?? null,
    aal: claims.aal === "aal2" ? "aal2" : "aal1",
    // nextLevel is aal2 once the user has a verified factor.
    hasMfaFactor: assurance?.nextLevel === "aal2",
  };
});

/**
 * Route guard for pages and layouts: redirects to login, MFA, no-access or the
 * member's own home, otherwise returns the member. The database enforces the same
 * rules through RLS; this only keeps people on the right screens.
 */
export async function requireMember(
  allowed?: readonly AppRole[],
): Promise<CurrentMember & { role: AppRole }> {
  const member = await getCurrentMember();
  const target = guardRedirect(member, allowed);
  if (target) {
    redirect({ href: target, locale: await getLocale() });
  }
  return member as CurrentMember & { role: AppRole };
}
