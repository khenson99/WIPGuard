import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    ".claude/**",
    ".worktrees/**",
    "next-env.d.ts",
    // Deployment helper script intentionally uses CommonJS.
    "migrate.cjs",
    // Ops script intentionally uses CommonJS.
    "scripts/backfill-google-oauth-scope-aliases.cjs",
    // One-off ops/debug scripts (CommonJS / loose typing).
    "test-pg-pylon.cjs",
    "get-pg-errors.cjs",
    "check-meta.cjs",
    "debug-pylon-pg.cjs",
    "merge_deals.js",
    "list_deals.js",
    "delete_deals.js",
    "scripts/test-meta-api.js",
  ]),
]);

export default eslintConfig;
