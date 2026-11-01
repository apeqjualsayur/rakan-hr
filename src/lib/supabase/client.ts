import { createBrowserClient } from "@supabase/ssr";
import { requireSupabaseEnv } from "./env";

// For Client Components ("use client").
export function createClient() {
  const { url, publishableKey } = requireSupabaseEnv();
  return createBrowserClient(url, publishableKey);
}
