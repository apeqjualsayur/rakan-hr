import "server-only";
import { getCurrentMember, type CurrentMember } from "@/lib/auth/member";
import {
  can,
  needsMfa,
  type AppRole,
  type SettingsAction,
} from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import type { ErrorKey, FormState } from "./form";

type Member = CurrentMember & { role: AppRole; tenantId: string };

/**
 * For Settings server actions: the caller and a Supabase client acting as them, or null
 * when they may not do `action`. RLS enforces the same rules; this gives a clear message.
 */
export async function settingsContext(action: SettingsAction) {
  const member = await getCurrentMember();
  if (!member.tenantId || !can(member.role, action) || needsMfa(member))
    return null;
  return { member: member as Member, supabase: await createClient() };
}

export const failed = (message: ErrorKey): FormState => ({
  status: "error",
  message,
});

export const saved = (): FormState => ({ status: "saved", at: Date.now() });
