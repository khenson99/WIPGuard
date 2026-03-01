import { defineConfig, configDefaults } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
    exclude: [
      ...configDefaults.exclude,
      "**/.claude/**",
      "**/.worktrees/**",
      "**/.next/**",
      "**/src/generated/**",
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
