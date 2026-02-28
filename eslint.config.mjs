import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/components/analytics/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "BinaryExpression[operator='*'][right.value=100][left.property.name='bounceRate']",
          message: "Use `data.kpis.traffic.bounceRatePct` (server-canonical) instead of multiplying bounce rate by 100 in UI.",
        },
        {
          selector: "BinaryExpression[operator='*'][left.value=100][right.property.name='bounceRate']",
          message: "Use `data.kpis.traffic.bounceRatePct` (server-canonical) instead of multiplying bounce rate by 100 in UI.",
        },
        {
          selector: "BinaryExpression[operator='*'][right.value=100][left.property.name='successRate']",
          message: "Use `data.kpis.finance.paymentSuccessPct` (server-canonical) instead of multiplying payment success rate by 100 in UI.",
        },
        {
          selector: "BinaryExpression[operator='*'][left.value=100][right.property.name='successRate']",
          message: "Use `data.kpis.finance.paymentSuccessPct` (server-canonical) instead of multiplying payment success rate by 100 in UI.",
        },
        {
          selector: "BinaryExpression[operator='*'][right.value=12][left.property.name='mrr']",
          message: "Use `data.kpis.finance.arr` (server-canonical) instead of computing ARR as `mrr * 12` in UI.",
        },
        {
          selector: "BinaryExpression[operator='*'][left.value=12][right.property.name='mrr']",
          message: "Use `data.kpis.finance.arr` (server-canonical) instead of computing ARR as `mrr * 12` in UI.",
        },
      ],
    },
  },
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
