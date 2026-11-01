import { describe, expect, it } from "vitest";
import {
  memberStatus,
  parseInvite,
  sortMembers,
  type MemberRow,
} from "./members";

const form = (fields: Record<string, string | string[]>) => {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields))
    for (const value of [v].flat()) data.append(k, value);
  return data;
};

const BRANCH = "5eed0000-0000-4000-8000-000000000002";

describe("parseInvite", () => {
  it("lower-cases the email and keeps the role", () => {
    expect(
      parseInvite(form({ email: " Accountant@Firm.MY ", role: "auditor" })),
    ).toEqual({
      ok: true,
      values: { email: "accountant@firm.my", role: "auditor", branch_ids: [] },
    });
  });

  it("keeps branch scope only for managers", () => {
    const manager = parseInvite(
      form({ email: "a@b.my", role: "manager", branch_ids: [BRANCH, "nope"] }),
    );
    expect(manager.ok && manager.values.branch_ids).toEqual([BRANCH]);
    const staff = parseInvite(
      form({ email: "a@b.my", role: "staff", branch_ids: BRANCH }),
    );
    expect(staff.ok && staff.values.branch_ids).toEqual([]);
  });

  it("rejects a bad email or an unknown role", () => {
    expect(parseInvite(form({ email: "nope", role: "boss" }))).toEqual({
      ok: false,
      errors: { email: "invalidEmail", role: "invalidRole" },
    });
  });
});

describe("member status", () => {
  const row = (over: Partial<MemberRow>): MemberRow => ({
    id: "m",
    user_id: null,
    invited_email: "x@y.my",
    role: "staff",
    branch_ids: [],
    is_active: true,
    invite_sent_at: null,
    invite_error: null,
    created_at: "2026-11-01T00:00:00Z",
    ...over,
  });

  it("tells invited, active and deactivated apart and lists them in that order", () => {
    const invited = row({ id: "i" });
    const active = row({ id: "a", user_id: "u" });
    const gone = row({ id: "g", user_id: "u2", is_active: false });
    expect([invited, active, gone].map(memberStatus)).toEqual([
      "invited",
      "active",
      "deactivated",
    ]);
    expect(sortMembers([gone, invited, active]).map((r) => r.id)).toEqual([
      "a",
      "i",
      "g",
    ]);
  });
});
