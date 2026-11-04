"use server";

import { refresh } from "next/cache";
import { redirect } from "@/i18n/navigation";
import { getCurrentMember } from "@/lib/auth/member";
import { needsMfa } from "@/lib/auth/roles";
import { failed, saved, settingsContext } from "@/lib/settings/server";
import {
  formLocale,
  isUuid,
  type ErrorKey,
  type FormState,
} from "@/lib/settings/form";
import { createClient } from "@/lib/supabase/server";
import type { LetterKind } from "./letters";
import {
  parseCandidate,
  parseOffer,
  parseOpening,
  parseProbationReview,
  parseTemplate,
} from "./logic";
import { hiringErrorKey, invokeHiring } from "./server";
import { CANDIDATE_STAGES, type CandidateStage } from "./types";

// Step 8 server actions for the owner and HR admin (and managers for probation reviews).
// RLS and the database functions decide; these turn results into messages.

async function hiringContext() {
  return settingsContext("manageHiring");
}

const dbFailed = (
  error: Parameters<typeof hiringErrorKey>[0],
  context: string,
): FormState => failed(hiringErrorKey(error, context));

// ── HIR-01 openings ──

export async function saveOpening(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await hiringContext();
  if (!ctx) return failed("forbidden");
  const parsed = parseOpening(formData);
  if (!parsed.ok) return { status: "error", errors: parsed.errors };
  const id = formData.get("opening_id");
  if (isUuid(id)) {
    const { error } = await ctx.supabase
      .from("job_openings")
      .update(parsed.values)
      .eq("id", id);
    if (error) return dbFailed(error, "saveOpening");
    refresh();
    return saved();
  }
  const { error } = await ctx.supabase
    .from("job_openings")
    .insert({ ...parsed.values, tenant_id: ctx.member.tenantId });
  if (error) return dbFailed(error, "saveOpening");
  redirect({ href: "/admin/hiring/openings", locale: formLocale(formData) });
  return saved();
}

// ── HIR-02 candidates ──

/** The browser uploads the CV to the private `candidates` bucket first; its path comes here. */
function cvPath(formData: FormData, tenantId: string) {
  const path = String(formData.get("cv_path") ?? "");
  return path.startsWith(`${tenantId}/`) && !path.includes("..") ? path : null;
}

export async function saveCandidate(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await hiringContext();
  if (!ctx) return failed("forbidden");
  const parsed = parseCandidate(formData);
  if (!parsed.ok) return { status: "error", errors: parsed.errors };
  const cv = cvPath(formData, ctx.member.tenantId);
  const values = { ...parsed.values, ...(cv ? { cv_path: cv } : {}) };

  const id = formData.get("candidate_id");
  if (isUuid(id)) {
    const { error } = await ctx.supabase
      .from("candidates")
      .update(values)
      .eq("id", id);
    if (error) return dbFailed(error, "saveCandidate");
    refresh();
    return saved();
  }
  const { data, error } = await ctx.supabase
    .from("candidates")
    .insert({ ...values, tenant_id: ctx.member.tenantId })
    .select("id")
    .single();
  if (error || !data)
    return error ? dbFailed(error, "saveCandidate") : failed("saveFailed");
  redirect({
    href: `/admin/hiring/candidates/${data.id as string}`,
    locale: formLocale(formData),
  });
  return saved();
}

/** Applied / Interview / Offer / Rejected by hand; a reason is kept when rejecting. */
export async function moveCandidate(
  id: string,
  stage: CandidateStage,
  reason?: string,
): Promise<FormState> {
  const ctx = await hiringContext();
  if (
    !ctx ||
    !isUuid(id) ||
    !CANDIDATE_STAGES.includes(stage) ||
    stage === "hired"
  )
    return failed("forbidden");
  const { data, error } = await ctx.supabase
    .from("candidates")
    .update({
      stage,
      ...(stage === "rejected"
        ? { rejected_reason: reason?.trim().slice(0, 500) || null }
        : {}),
    })
    .eq("id", id)
    .select("id");
  if (error) return dbFailed(error, "moveCandidate");
  if (!data?.length) return failed("notFound");
  refresh();
  return saved();
}

async function signedUrl(
  bucket: string,
  path: string | null | undefined,
): Promise<{ url: string } | { error: ErrorKey }> {
  if (!path) return { error: "notFound" };
  const supabase = await createClient();
  const { data } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, 300);
  return data ? { url: data.signedUrl } : { error: "notFound" };
}

export async function cvUrl(candidateId: string) {
  const ctx = await settingsContext("viewHiring");
  if (!ctx || !isUuid(candidateId)) return { error: "forbidden" as const };
  const { data } = await ctx.supabase
    .from("candidates")
    .select("cv_path")
    .eq("id", candidateId)
    .maybeSingle();
  return signedUrl("candidates", data?.cv_path as string | undefined);
}

// ── HIR-03 offers ──

export async function saveOffer(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await hiringContext();
  if (!ctx) return failed("forbidden");
  const parsed = parseOffer(formData);
  if (!parsed.ok) return { status: "error", errors: parsed.errors };
  const offerId = formData.get("offer_id");
  const candidateId = formData.get("candidate_id");
  const { error } = isUuid(offerId)
    ? await ctx.supabase.from("offers").update(parsed.values).eq("id", offerId)
    : isUuid(candidateId)
      ? await ctx.supabase
          .from("offers")
          .insert({ ...parsed.values, candidate_id: candidateId })
      : { error: null };
  if (error) return dbFailed(error, "saveOffer");
  refresh();
  return saved();
}

export type SendState = FormState & { emailError?: boolean };

/** Renders the letter, sends the offer and emails the candidate a single-use link. */
export async function sendOffer(offerId: string): Promise<SendState> {
  const ctx = await hiringContext();
  if (!ctx || !isUuid(offerId)) return failed("forbidden");
  const result = await invokeHiring<{ email_error: string | null }>(
    ctx.supabase,
    {
      action: "send_offer",
      offer_id: offerId,
    },
  );
  refresh();
  if ("error" in result) return failed(result.error);
  return { ...saved(), emailError: Boolean(result.data.email_error) };
}

export async function resendLink(offerId: string): Promise<SendState> {
  const ctx = await hiringContext();
  if (!ctx || !isUuid(offerId)) return failed("forbidden");
  const result = await invokeHiring<{ email_error: string | null }>(
    ctx.supabase,
    {
      action: "resend_link",
      offer_id: offerId,
    },
  );
  refresh();
  if ("error" in result) return failed(result.error);
  return { ...saved(), emailError: Boolean(result.data.email_error) };
}

export async function withdrawOffer(offerId: string): Promise<FormState> {
  const ctx = await hiringContext();
  if (!ctx || !isUuid(offerId)) return failed("forbidden");
  const { error } = await ctx.supabase.rpc("withdraw_offer", {
    p_offer_id: offerId,
  });
  if (error) return dbFailed(error, "withdrawOffer");
  refresh();
  return saved();
}

/** 5-minute link to the sent letter, or to the candidate's signed copy once accepted. */
export async function offerFileUrl(offerId: string) {
  const ctx = await settingsContext("viewHiring");
  if (!ctx || !isUuid(offerId)) return { error: "forbidden" as const };
  const { data } = await ctx.supabase
    .from("offers")
    .select("pdf_path, signature_id, signatures (signed_pdf_path)")
    .eq("id", offerId)
    .maybeSingle();
  const signedCopy = (
    data as { signatures: { signed_pdf_path: string } | null } | null
  )?.signatures?.signed_pdf_path;
  return signedCopy
    ? signedUrl("signed", signedCopy)
    : signedUrl("letters", data?.pdf_path as string | undefined);
}

// ── HIR-05 convert ──

export async function convertCandidate(
  candidateId: string,
  locale: string,
): Promise<FormState> {
  const ctx = await hiringContext();
  if (!ctx || !isUuid(candidateId)) return failed("forbidden");
  const { data, error } = await ctx.supabase.rpc("convert_candidate", {
    p_candidate_id: candidateId,
  });
  if (error) return dbFailed(error, "convertCandidate");
  const employeeId = (data as { employee_id: string }).employee_id;
  redirect({
    href: `/admin/people/${employeeId}?tab=onboarding&converted=1`,
    locale: locale === "ms" ? "ms" : "en",
  });
  return saved();
}

// ── HIR-03 letter templates ──

export async function saveTemplate(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await hiringContext();
  const id = formData.get("template_id");
  const kind = String(formData.get("kind")) as LetterKind;
  if (!ctx || !isUuid(id)) return failed("forbidden");
  const parsed = parseTemplate(formData, kind);
  if (!parsed.ok) return { status: "error", errors: parsed.errors };
  const { data, error } = await ctx.supabase
    .from("letter_templates")
    .update(parsed.values)
    .eq("id", id)
    .eq("kind", kind)
    .select("id");
  if (error) return dbFailed(error, "saveTemplate");
  if (!data?.length) return failed("notFound");
  refresh();
  return saved();
}

// ── HIR-06 onboarding tasks ──

export async function setTaskDone(
  id: string,
  done: boolean,
): Promise<FormState> {
  const ctx = await hiringContext();
  if (!ctx || !isUuid(id)) return failed("forbidden");
  const { error } = await ctx.supabase
    .from("onboarding_tasks")
    .update({ done_at: done ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) return dbFailed(error, "setTaskDone");
  refresh();
  return saved();
}

export async function addTask(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await hiringContext();
  const employeeId = formData.get("employee_id");
  if (!ctx || !isUuid(employeeId)) return failed("forbidden");
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { status: "error", errors: { title: "required" } };
  if (title.length > 200)
    return { status: "error", errors: { title: "tooLong" } };
  const due = String(formData.get("due_date") ?? "");
  const { error } = await ctx.supabase.from("onboarding_tasks").insert({
    employee_id: employeeId,
    title,
    owner_role: "hr_admin",
    due_date: /^\d{4}-\d{2}-\d{2}$/.test(due) ? due : null,
    sort_order: 1000,
  });
  if (error) return dbFailed(error, "addTask");
  refresh();
  return saved();
}

export async function deleteTask(id: string): Promise<FormState> {
  const ctx = await hiringContext();
  if (!ctx || !isUuid(id)) return failed("forbidden");
  const { error } = await ctx.supabase
    .from("onboarding_tasks")
    .delete()
    .eq("id", id);
  if (error) return dbFailed(error, "deleteTask");
  refresh();
  return saved();
}

// ── HIR-07 probation ──

async function memberContext() {
  const member = await getCurrentMember();
  if (!member.tenantId || !member.role || needsMfa(member)) return null;
  return { member, supabase: await createClient() };
}

/** Manager (or HR / owner) submits the review; it goes to the Owner for approval. */
export async function submitProbationReview(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await memberContext();
  const employeeId = formData.get("employee_id");
  if (!ctx || !isUuid(employeeId)) return failed("forbidden");
  const parsed = parseProbationReview(formData);
  if (!parsed.ok) return { status: "error", errors: parsed.errors };
  const { error } = await ctx.supabase.rpc("submit_probation_review", {
    p_employee_id: employeeId,
    p_ratings: parsed.values.ratings,
    p_comments: parsed.values.comments,
    p_recommendation: parsed.values.recommendation,
    p_extend_months: parsed.values.extend_months,
  });
  if (error) return dbFailed(error, "submitProbationReview");
  refresh();
  return saved();
}

/** Owner approves or rejects (comment required to reject) through the approval engine. */
export async function decideProbationReview(
  approvalId: string,
  decision: "approved" | "rejected",
  comment: string,
): Promise<FormState> {
  const ctx = await settingsContext("approveProbation");
  if (!ctx || !isUuid(approvalId)) return failed("forbidden");
  if (decision === "rejected" && !comment.trim())
    return failed("reasonRequired");
  const { error } = await ctx.supabase.rpc("act_on_approval", {
    p_approval_id: approvalId,
    p_decision: decision,
    p_comment: comment.trim() || null,
  });
  if (error) return dbFailed(error, "decideProbationReview");
  refresh();
  return saved();
}

export async function retryProbationLetter(
  reviewId: string,
): Promise<FormState> {
  const ctx = await hiringContext();
  if (!ctx || !isUuid(reviewId)) return failed("forbidden");
  const { error } = await ctx.supabase.rpc("retry_probation_letter", {
    p_review_id: reviewId,
  });
  if (error) return dbFailed(error, "retryProbationLetter");
  refresh();
  return saved();
}

/** 5-minute link to a probation letter (filed in the employee's documents). */
export async function probationLetterUrl(reviewId: string) {
  const ctx = await memberContext();
  if (!ctx || !isUuid(reviewId)) return { error: "forbidden" as const };
  const { data } = await ctx.supabase
    .from("probation_reviews")
    .select("letter_path")
    .eq("id", reviewId)
    .maybeSingle();
  return signedUrl("documents", data?.letter_path as string | undefined);
}
