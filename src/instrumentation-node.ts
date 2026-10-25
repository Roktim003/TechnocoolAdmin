/**
 * Node.js start-up of the web server (imported by instrumentation.ts in the Node runtime only):
 * validates the configuration (refuses to start on a missing or weak secret), starts error
 * tracking when SENTRY_DSN is set, wires the modules and installs the graceful-shutdown handler.
 */
export async function startWebServer() {
  const { env } = await import("./shared/config/env");
  const { logger } = await import("./shared/logger/logger");
  try {
    env();
  } catch (err) {
    logger.fatal({ err: { message: (err as Error).message } }, "invalid configuration: refusing to start");
    process.exit(1);
  }

  const { initErrorTracking, flushErrorTracking } = await import("./shared/monitoring/sentry");
  await initErrorTracking("web");

  const { wireModules } = await import("./modules/bootstrap");
  wireModules();

  // The Docker image sets NEXT_MANUAL_SIG_HANDLE=true, so SIGTERM comes here instead of Next's
  // own handler (which exits without closing the database and Redis connections).
  if (process.env.NEXT_MANUAL_SIG_HANDLE) {
    const { onShutdown, shutdown } = await import("./shared/lifecycle/shutdown");
    const { prisma } = await import("./shared/db/prisma");
    const { redis } = await import("./shared/redis/redis");
    const { closeQueues } = await import("./shared/queue/queue");
    onShutdown("prisma", () => prisma.$disconnect());
    onShutdown("redis", () => redis().quit());
    onShutdown("queues", () => closeQueues());
    onShutdown("error-tracking", () => flushErrorTracking());
    const log = logger.child({ component: "web" });
    const timeoutMs = env().SHUTDOWN_TIMEOUT_MS;
    process.on("SIGTERM", () => void shutdown("SIGTERM", { timeoutMs, log }));
    process.on("SIGINT", () => void shutdown("SIGINT", { timeoutMs, log }));
  }
}
