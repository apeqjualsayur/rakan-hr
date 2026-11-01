"use server";

import { hasLocale } from "next-intl";
import { redirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { createClient } from "@/lib/supabase/server";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function localeFrom(formData: FormData) {
  const value = formData.get("locale");
  return hasLocale(routing.locales, value) ? value : routing.defaultLocale;
}

export type RequestCodeResult =
  | { status: "sent"; email: string }
  | { status: "invalid_email" | "rate_limited" | "error" };

// FND-01 step 1: email a 6-digit code. Sign-up is allowed here, but the database's
// "Before User Created" hook rejects emails without an invite. Uninvited emails get the
// same "sent" answer, so the form never reveals who has an account.
export async function requestCode(
  formData: FormData,
): Promise<RequestCodeResult> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  if (!EMAIL.test(email)) return { status: "invalid_email" };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true },
  });

  if (error) {
    if (error.status === 429) return { status: "rate_limited" };
    // 403/422 = rejected by the invite hook or signups closed: answer as if sent.
    if (error.status !== 403 && error.status !== 422) {
      console.error("signInWithOtp failed", error.status, error.code);
      return { status: "error" };
    }
  }
  return { status: "sent", email };
}

export type VerifyCodeResult = { status: "invalid_code" | "error" };

// FND-01 step 2: check the code. On success the session cookie is set and the landing
// page routes the member by role (and to MFA first for owner / HR / payroll approver).
export async function verifyCode(
  formData: FormData,
): Promise<VerifyCodeResult> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const token = String(formData.get("code") ?? "").replace(/\D/g, "");
  if (!EMAIL.test(email) || token.length !== 6)
    return { status: "invalid_code" };

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: "email",
  });
  if (error) {
    return { status: error.status === 500 ? "error" : "invalid_code" };
  }
  redirect({ href: "/", locale: localeFrom(formData) });
  return { status: "error" }; // not reached: redirect() throws
}

export async function signOut(formData: FormData) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect({ href: "/login", locale: localeFrom(formData) });
}
