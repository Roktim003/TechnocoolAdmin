/** Next.js server start-up hook. The Node-only work lives in instrumentation-node.ts (kept out of the edge bundle). */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startWebServer } = await import("./instrumentation-node");
    await startWebServer();
  }
}
