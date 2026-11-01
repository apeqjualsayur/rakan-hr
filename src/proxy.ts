import createMiddleware from "next-intl/middleware";
import type { NextRequest } from "next/server";
import { routing } from "./i18n/routing";
import { updateSession } from "./lib/supabase/proxy";

const handleI18nRouting = createMiddleware(routing);

export async function proxy(request: NextRequest) {
  // 1. Pick the language (URL prefix, then saved cookie, then browser) and redirect if needed.
  const response = handleI18nRouting(request);
  // 2. Keep the Supabase login session fresh on that response.
  return updateSession(request, response);
}

export const config = {
  // Skip API routes, Next internals, and any path with a file extension (icons, manifest, etc.).
  matcher: "/((?!api|_next|_vercel|.*\\..*).*)",
};
