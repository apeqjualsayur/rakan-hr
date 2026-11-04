import "server-only";
import { createClient } from "@supabase/supabase-js";
import { cookies, headers } from "next/headers";
import { dbErrorKey } from "@/lib/people/server";
import { requireSupabaseEnv } from "@/lib/supabase/env";
import type { ErrorKey } from "@/lib/settings/form";
import { hintKey } from "./server";
import type { PreboardingContext } from "./types";

// HIR-04 pre-boarding portal, server side. Candidates have no Rakan account: the emailed
// link is exchanged once for a session (preboarding_redeem), kept in an httpOnly cookie.
// Every call passes it to a preboarding_* database function, which checks it. This client
// uses only the public key; it never sees anyone's login.

export const SESSION_COOKIE = "rakan_preboarding";

export async function readSession() {
  return (await cookies()).get(SESSION_COOKIE)?.value ?? null;
}

export async function storeSession(session: string, expiresAt: string) {
  (await cookies()).set(SESSION_COOKIE, session, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(expiresAt),
  });
}

export async function clearSession() {
  (await cookies()).delete(SESSION_COOKIE);
}

export function publicClient() {
  const { url, publishableKey } = requireSupabaseEnv();
  return createClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type Rpc<T> = { data: T } | { error: ErrorKey; hint?: string };

/** Calls a preboarding_* function with the session. */
export async function preboardingRpc<T>(
  name: string,
  args: Record<string, unknown> = {},
): Promise<Rpc<T>> {
  const session = await readSession();
  if (!session) return { error: "sessionEnded", hint: "session_invalid" };
  const { data, error } = await publicClient().rpc(name, {
    p_session: session,
    ...args,
  });
  if (!error) return { data: data as T };
  return {
    error: hintKey(error.hint) ?? dbErrorKey(error, name),
    hint: error.hint ?? undefined,
  };
}

export async function loadPreboarding(): Promise<
  PreboardingContext | "no_session" | "ended"
> {
  if (!(await readSession())) return "no_session";
  const result = await preboardingRpc<PreboardingContext>(
    "preboarding_context",
  );
  return "data" in result ? result.data : "ended";
}

/** Calls the `hiring` Edge Function as the candidate (offer link, click-to-sign). */
export async function preboardingFunction<T>(
  body: Record<string, unknown>,
): Promise<Rpc<T>> {
  const session = await readSession();
  if (!session) return { error: "sessionEnded" };
  const { data, error } = await publicClient().functions.invoke("hiring", {
    body,
    headers: { "x-preboarding-session": session },
  });
  if (!error) return { data: data as T };
  const response = (error as { context?: Response }).context;
  const payload = response ? await response.json().catch(() => null) : null;
  const key = hintKey(payload?.error);
  if (!key) console.error("hiring (pre-boarding) failed", body.action, payload);
  return { error: key ?? "saveFailed" };
}

/** The candidate's IP and browser as seen by the server (for the signature record). */
export async function requestInfo() {
  const h = await headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    "unknown";
  return { ip, userAgent: (h.get("user-agent") ?? "unknown").slice(0, 500) };
}
