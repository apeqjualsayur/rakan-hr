"use server";

import { refresh } from "next/cache";
import { dbErrorKey, failed, peopleContext, saved } from "@/lib/people/server";
import { isUuid, type FormState } from "@/lib/settings/form";

// EMP-07: approve or reject a profile / bank change through the approval engine (FND-03).
// act_on_approval() checks the caller may act on the step and is not the requester; the
// approvals trigger then applies the change (or rejects the pending bank account).
export async function decideChange(
  approvalId: string,
  decision: "approved" | "rejected",
  comment: string,
): Promise<FormState> {
  const ctx = await peopleContext("reviewChanges");
  if (!ctx || !isUuid(approvalId)) return failed("forbidden");
  if (decision !== "approved" && decision !== "rejected")
    return failed("invalidChoice");
  if (decision === "rejected" && comment.trim() === "")
    return { status: "error", errors: { comment: "required" } };

  const { error } = await ctx.supabase.rpc("act_on_approval", {
    p_approval_id: approvalId,
    p_decision: decision,
    p_comment: comment.trim() || null,
  });
  if (error) return failed(dbErrorKey(error, "decideChange"));
  refresh();
  return saved();
}
