import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseEnv } from "./env";

// Signed-in areas. Role and MFA checks happen in their layouts (src/lib/auth/member.ts);
// here we only bounce signed-out visitors to the login page early.
const PROTECTED = /^\/(en|ms)\/(admin|staff|mfa|no-access)(\/|$)/;

// Refreshes the Supabase auth session cookie on the outgoing response.
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
  const { data } = await supabase.auth.getClaims();

  const match = request.nextUrl.pathname.match(PROTECTED);
  if (!data?.claims && match) {
    return NextResponse.redirect(new URL(`/${match[1]}/login`, request.url));
  }

  return response;
}
