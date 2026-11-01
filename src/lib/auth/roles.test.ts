import { describe, expect, it } from "vitest";
import {
  ADMIN_ROLES,
  APP_ROLES,
  guardRedirect,
  homeFor,
  needsMfa,
  type MemberState,
} from "./roles";

const member = (over: Partial<MemberState>): MemberState => ({
  signedIn: true,
  role: "staff",
  aal: "aal1",
  hasMfaFactor: false,
  ...over,
});

describe("homeFor", () => {
  it("sends admin roles to the desktop shell and managers / staff to mobile", () => {
    expect(homeFor("owner")).toBe("/admin");
    expect(homeFor("hr_admin")).toBe("/admin");
    expect(homeFor("payroll_approver")).toBe("/admin");
    expect(homeFor("auditor")).toBe("/admin");
    expect(homeFor("manager")).toBe("/staff");
    expect(homeFor("staff")).toBe("/staff");
  });
});

describe("guardRedirect", () => {
  it("sends signed-out visitors to login", () => {
    expect(guardRedirect(member({ signedIn: false, role: null }))).toBe(
      "/login",
    );
  });

  it("sends users without an active membership to no-access", () => {
    expect(guardRedirect(member({ role: null }))).toBe("/no-access");
  });

  it.each(["owner", "hr_admin", "payroll_approver"] as const)(
    "requires MFA for %s",
    (role) => {
      expect(guardRedirect(member({ role, aal: "aal1" }))).toBe("/mfa");
      expect(
        guardRedirect(member({ role, aal: "aal1", hasMfaFactor: true })),
      ).toBe("/mfa");
      expect(
        guardRedirect(member({ role, aal: "aal2" }), ADMIN_ROLES),
      ).toBeNull();
    },
  );

  it.each(["manager", "staff", "auditor"] as const)(
    "does not require MFA for %s",
    (role) => {
      expect(needsMfa(member({ role }))).toBe(false);
      expect(guardRedirect(member({ role }))).toBeNull();
    },
  );

  it("redirects a role to its own home when the page does not allow it", () => {
    expect(guardRedirect(member({ role: "staff" }), ADMIN_ROLES)).toBe(
      "/staff",
    );
    expect(
      guardRedirect(member({ role: "owner", aal: "aal2" }), ["staff"]),
    ).toBe("/admin");
  });

  it("covers every role", () => {
    for (const role of APP_ROLES) {
      const result = guardRedirect(member({ role, aal: "aal2" }), [role]);
      expect(result).toBeNull();
    }
  });
});
