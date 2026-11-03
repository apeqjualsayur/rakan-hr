import "server-only";
import { cache } from "react";
import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  guardRedirect,
  needsMfa,
  type AppRole,
  type MemberState,
} from "./roles";

export type CurrentMember = MemberState & {
  userId: string | null;
  email: string | null;
  membershipId: string | null;
  tenantId: string | null;
  employeeId: string | null;
  /** CMP-05: the PDPA notice this user must sign before anything else, if any. */
  pendingPrivacyNoticeId: string | null;
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
  pendingPrivacyNoticeId: null,
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

  const role = (membership?.role as AppRole | undefined) ?? null;
  const aal = claims.aal === "aal2" ? "aal2" : "aal1";
  // Only once they can see tenant data (after MFA for admin roles) can this be known.
  const { data: pendingPrivacy } =
    role && !needsMfa({ signedIn: true, role, aal, hasMfaFactor: false })
      ? await supabase.rpc("pending_privacy_notice")
      : { data: null };

  return {
    signedIn: true,
    userId: claims.sub,
    email: typeof claims.email === "string" ? claims.email : null,
    role: (membership?.role as AppRole | undefined) ?? null,
    membershipId: membership?.id ?? null,
    tenantId: membership?.tenant_id ?? null,
    employeeId: membership?.employee_id ?? null,
    aal,
    // nextLevel is aal2 once the user has a verified factor.
    hasMfaFactor: assurance?.nextLevel === "aal2",
    pendingPrivacyNoticeId: (pendingPrivacy as string | null) ?? null,
    mustSignPrivacy: Boolean(pendingPrivacy),
  };
});

/**
 * Route guard for pages and layouts: redirects to login, MFA, no-access or the
 * member's own home, otherwise returns the member. The database enforces the same
 * rules through RLS; this only keeps people on the right screens.
 */
export async function requireMember(
  allowed?: readonly AppRole[],
  { privacyNoticePage = false } = {},
): Promise<CurrentMember & { role: AppRole }> {
  const member = await getCurrentMember();
  const target = guardRedirect(
    privacyNoticePage ? { ...member, mustSignPrivacy: false } : member,
    allowed,
  );
  if (target) {
    redirect({ href: target, locale: await getLocale() });
  }
  return member as CurrentMember & { role: AppRole };
}
