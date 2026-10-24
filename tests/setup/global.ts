import { execSync } from "node:child_process";
import { TEST_ENV } from "./test-env";

/** Applies migrations to the test database once per run. */
export default function setup() {
  const url = new URL(TEST_ENV.DATABASE_URL!);
  if (!url.pathname.toLowerCase().includes("test")) {
    throw new Error(`Refusing to run tests against '${url.pathname}': the test database name must contain "test".`);
  }
  execSync("npx prisma migrate deploy", { stdio: "pipe", env: { ...process.env, ...TEST_ENV } });
}
