import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
    exclude: [
      "**/node_modules/**",
      "**/.claude/**",
      "**/.claire/**",
      "**/.worktrees/**",
      "**/.ralph-team/**",
      "**/dist/**",
      "**/.next/**",
      "**/src/generated/**",
      "**/tests/e2e/**",
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
