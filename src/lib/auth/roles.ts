// Roles (data-model.md §4 app_role) and the routing rules that follow from them.
// Pure functions: the server guard in member.ts and the tests both use these.

export const APP_ROLES = [
  "owner",
  "hr_admin",
  "payroll_approver",
  "manager",
  "staff",
  "auditor",
] as const;
export type AppRole = (typeof APP_ROLES)[number];

/** PRD §7: MFA is required for Owner, HR Admin and Payroll Approver. */
export const MFA_ROLES: readonly AppRole[] = [
  "owner",
  "hr_admin",
  "payroll_approver",
];

/** Desktop admin shell (ui-system.md §3.1). Managers and staff use the mobile shell. */
export const ADMIN_ROLES: readonly AppRole[] = [
  "owner",
  "hr_admin",
  "payroll_approver",
  "auditor",
];
export const STAFF_ROLES: readonly AppRole[] = ["manager", "staff"];

export type HomePath = "/admin" | "/staff";

export function homeFor(role: AppRole): HomePath {
  return ADMIN_ROLES.includes(role) ? "/admin" : "/staff";
}

export type MemberState = {
  signedIn: boolean;
  role: AppRole | null;
  /** Assurance level of the current session: aal2 = passed MFA. */
  aal: "aal1" | "aal2" | null;
  /** The user has a verified TOTP factor. */
  hasMfaFactor: boolean;
};

export type GuardPath = "/login" | "/no-access" | "/mfa" | HomePath;

/**
 * Where a request should go instead, or null to let it through.
 * `allowed` = roles the page accepts; omit to accept any member (e.g. the landing page).
 */
export function guardRedirect(
  state: MemberState,
  allowed?: readonly AppRole[],
): GuardPath | null {
  if (!state.signedIn) return "/login";
  if (!state.role) return "/no-access";
  if (MFA_ROLES.includes(state.role) && state.aal !== "aal2") return "/mfa";
  if (allowed && !allowed.includes(state.role)) return homeFor(state.role);
  return null;
}

/** True when the member must set up or enter a TOTP code before using the app. */
export function needsMfa(state: MemberState): boolean {
  return (
    state.role !== null &&
    MFA_ROLES.includes(state.role) &&
    state.aal !== "aal2"
  );
}
