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
  /** CMP-05: a PDPA notice is published that this user has not signed yet. */
  mustSignPrivacy?: boolean;
};

export type GuardPath =
  "/login" | "/no-access" | "/mfa" | "/privacy-notice" | HomePath;

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
  // CMP-05: nobody uses Rakan before signing the current PDPA notice.
  if (state.mustSignPrivacy) return "/privacy-notice";
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

// Screen permissions (Settings: Step 4, People: Step 5). These mirror the RLS policies; the
// UI uses them only to show or hide controls, the database enforces them.
const ACCESS = {
  /** Company profile and employer numbers (tenants_update). */
  editCompany: ["owner"],
  /** Branches, geofence and operating hours (branches_insert / _update). */
  manageBranches: ["owner", "hr_admin"],
  /** Invite people and change roles (memberships_insert / _update). */
  manageUsers: ["owner"],
  /** See the Users list (memberships_select_tenant). */
  viewUsers: ["owner", "hr_admin", "auditor"],
  /** Change checklist status, due dates and evidence (setup_checklist_items_update). */
  editChecklist: ["owner", "hr_admin"],
  /** See the Employer Setup Checklist (setup_checklist_items_select). */
  viewChecklist: ["owner", "hr_admin", "payroll_approver", "auditor"],
  /** People list and employee records (employees_select). */
  viewPeople: ["owner", "hr_admin", "payroll_approver", "auditor"],
  /** Add and edit employees, contracts, dependents, documents (employees_insert / _update). */
  editPeople: ["owner", "hr_admin"],
  /** IC numbers, bank accounts and documents (bank_accounts_select, documents_select). */
  viewSensitive: ["owner", "hr_admin"],
  /** Approve or reject profile and bank change requests (profile_change_reviewer). */
  reviewChanges: ["owner", "hr_admin"],
  /** See the change request queue (profile_change_requests_select). */
  viewChanges: ["owner", "hr_admin", "auditor"],
} as const satisfies Record<string, readonly AppRole[]>;

export type Action = keyof typeof ACCESS;

export function can(role: AppRole | null, action: Action): boolean {
  return role !== null && (ACCESS[action] as readonly AppRole[]).includes(role);
}
