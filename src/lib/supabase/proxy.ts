import { createServerClient } from "@supabase/ssr";
import type { NextRequest, NextResponse } from "next/server";
import { getSupabaseEnv } from "./env";

// Refreshes the Supabase auth session cookie on the outgoing response.
// Route protection by role is added in build step 3.
export async function updateSession(
  request: NextRequest,
  response: NextResponse,
) {
  const env = getSupabaseEnv();
  // Let the app run before .env.local is filled in.
  if (!env) return response;

  const supabase = createServerClient(env.url, env.publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value, options }) => {
          request.cookies.set(name, value);
          response.cookies.set(name, value, options);
        });
        Object.entries(headers).forEach(([key, value]) =>
          response.headers.set(key, value),
        );
      },
    },
  });

  // Do not put code between createServerClient and getClaims():
  // getClaims() is what validates and refreshes the session.
  await supabase.auth.getClaims();

  return response;
}
