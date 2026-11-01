"use server";

import { refresh } from "next/cache";
import type { PostgrestError } from "@supabase/supabase-js";
import {
  isUuid,
  type ErrorKey,
  type FieldErrors,
  type FormState,
} from "@/lib/settings/form";
import { parseInvite, parseRole } from "@/lib/settings/members";
import { failed, saved, settingsContext } from "@/lib/settings/server";

// Settings > Users. Owner only (memberships_* policies). The database also refuses to
// leave the company without an active Owner and only deletes unaccepted invites.

function errorKey(error: PostgrestError): ErrorKey {
  if (error.code === "23514") return "lastOwner";
  if (error.code === "23505") {
    return error.message.includes("memberships_one_active_per_user")
      ? "memberElsewhere"
      : "alreadyMember";
  }
  if (error.code === "42501") return "forbidden";
  console.error("memberships write failed", error.code, error.message);
  return "saveFailed";
}

/** Invite = a membership with invited_email; a database trigger emails the invite. */
export async function inviteMember(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await settingsContext("manageUsers");
  if (!ctx) return failed("forbidden");

  const parsed = parseInvite(formData);
  if (!parsed.ok) return { status: "error", errors: parsed.errors };

  const { email, role, branch_ids } = parsed.values;
  const { error } = await ctx.supabase.from("memberships").insert({
    tenant_id: ctx.member.tenantId,
    invited_email: email,
    role,
    branch_ids,
  });
  if (error) {
    const key = errorKey(error);
    const errors: FieldErrors = { email: key };
    return key === "alreadyMember" || key === "memberElsewhere"
      ? { status: "error", errors }
      : failed(key);
  }

  refresh();
  return saved();
}

/** Change someone's role (and a manager's branches). Not your own: ask another Owner. */
export async function updateMemberRole(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await settingsContext("manageUsers");
  const id = formData.get("membership_id");
  if (!ctx || !isUuid(id) || id === ctx.member.membershipId)
    return failed("forbidden");

  const errors: FieldErrors = {};
  const values = parseRole(formData, errors);
  if (Object.keys(errors).length) return { status: "error", errors };

  const { data, error } = await ctx.supabase
    .from("memberships")
    .update(values)
    .eq("id", id)
    .select("id");
  if (error) return failed(errorKey(error));
  if (!data?.length) return failed("notFound");

  refresh();
  return saved();
}

async function memberAction(
  id: string,
  run: (
    ctx: NonNullable<Awaited<ReturnType<typeof settingsContext>>>,
  ) => PromiseLike<{ error: PostgrestError | null; count?: number | null }>,
): Promise<FormState> {
  const ctx = await settingsContext("manageUsers");
  if (!ctx || !isUuid(id) || id === ctx.member.membershipId)
    return failed("forbidden");
  const { error, count } = await run(ctx);
  if (error) return failed(errorKey(error));
  if (count === 0) return failed("notFound");
  refresh();
  return saved();
}

/** Deactivated people can no longer sign in; history is kept. Reactivating restores access. */
export async function setMemberActive(id: string, active: boolean) {
  return memberAction(id, ({ supabase }) =>
    supabase
      .from("memberships")
      .update({ is_active: active }, { count: "exact" })
      .eq("id", id),
  );
}

export async function resendInvite(id: string) {
  return memberAction(id, ({ supabase }) =>
    supabase.rpc("resend_invite", { p_membership_id: id }),
  );
}

/** Only invites nobody has accepted yet can be removed (memberships_delete policy). */
export async function removeInvite(id: string) {
  return memberAction(id, ({ supabase }) =>
    supabase
      .from("memberships")
      .delete({ count: "exact" })
      .eq("id", id)
      .is("user_id", null),
  );
}
