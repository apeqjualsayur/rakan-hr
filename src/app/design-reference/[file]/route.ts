import { readFile } from "node:fs/promises";
import path from "node:path";

// Serves the reference PNGs from _specs/hr-system/ui-reference/ to the /design
// comparison page during development only. Never served in production.
const files = new Set([
  "desktop-owner-home.png",
  "mobile-staff-home.png",
  "mobile-my-credentials.png",
]);

export async function GET(
  _request: Request,
  ctx: RouteContext<"/design-reference/[file]">,
) {
  const { file } = await ctx.params;
  if (process.env.NODE_ENV === "production" || !files.has(file)) {
    return new Response("Not found", { status: 404 });
  }
  const data = await readFile(
    path.join(process.cwd(), "_specs", "hr-system", "ui-reference", file),
  );
  return new Response(new Uint8Array(data), {
    headers: { "Content-Type": "image/png", "Cache-Control": "no-store" },
  });
}
