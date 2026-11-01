import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Turns off style rules that Prettier handles; keep last.
  prettier,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated / tool output:
    "playwright-report/**",
    "test-results/**",
    "supabase/.temp/**",
    // Deno code (Edge Functions), not part of the Next.js app:
    "supabase/functions/**",
  ]),
]);

export default eslintConfig;
