// Both values are public by design (browser-safe); data is protected by RLS.
// The secret / service-role key must never be read here or anywhere in client code.
export function getSupabaseEnv() {
  // Accept the Data API URL (…/rest/v1/) by mistake: the clients need the project root.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(
    /\/(rest\/v1\/?)?$/,
    "",
  );
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) return null;
  return { url, publishableKey };
}

export function requireSupabaseEnv() {
  const env = getSupabaseEnv();
  if (!env) {
    throw new Error(
      "Supabase is not configured: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local (see .env.example).",
    );
  }
  return env;
}
