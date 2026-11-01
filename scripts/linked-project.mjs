// Prints which Supabase project the CLI is linked to. Runs before every db:push / db:reset
// (CLAUDE.md rule 12). With --dev-only it stops unless the linked project is the one
// .env.local points at (the dev project), so a destructive command never hits prod.

import { existsSync, readFileSync } from "node:fs";
import process from "node:process";

const refFile = "supabase/.temp/project-ref";
if (!existsSync(refFile)) {
  console.error(
    "✖ No linked project. Run: npm run db:link -- <dev project ref>",
  );
  process.exit(1);
}
const linkedRef = readFileSync(refFile, "utf8").trim();

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const appUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const isAppProject = appUrl.includes(linkedRef);

console.log(
  `→ Supabase CLI is linked to project ${linkedRef}` +
    (isAppProject
      ? " (the dev project in .env.local)"
      : " (NOT the project in .env.local)"),
);

if (process.argv.includes("--dev-only") && !isAppProject) {
  console.error(
    "✖ Stopped: this command only runs against the dev project in .env.local.",
  );
  process.exit(1);
}
