import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Package unit tests under tests/; infrastructure/tests covers the
    // remaining shell-adjacent tooling (.test.ts) and zero-dep .mjs skill
    // scripts (.test.mjs).
    include: ["tests/**/*.test.ts", "infrastructure/tests/**/*.test.{ts,mjs}"],
    setupFiles: ["./tests/setup.ts"],
  },
});
