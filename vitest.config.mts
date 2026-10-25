import path from "node:path";
import { defineConfig } from "vitest/config";

const alias = { "@": path.resolve(import.meta.dirname, "src") };

// Pages and components are tested as React elements (automatic JSX runtime, like Next.js).
const oxc = { jsx: { runtime: "automatic" as const } };

export default defineConfig({
  resolve: { alias },
  oxc,
  test: {
    environment: "node",
    setupFiles: ["tests/setup/env.ts"],
    testTimeout: 20_000,
    hookTimeout: 60_000,
    // Integration files share one database and one Redis, so run test files one at a time.
    fileParallelism: false,
    projects: [
      {
        resolve: { alias },
        oxc,
        test: { name: "unit", include: ["tests/unit/**/*.test.ts"], setupFiles: ["tests/setup/env.ts"] },
      },
      {
        resolve: { alias },
        oxc,
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          setupFiles: ["tests/setup/env.ts", "tests/setup/modules.ts"],
          // Applies migrations to the test database once per run.
          globalSetup: ["tests/setup/global.ts"],
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
