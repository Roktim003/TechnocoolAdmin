/** Next.js server start-up hook: wires the modules once per server process (Node.js runtime only). */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { wireModules } = await import("./modules/bootstrap");
    wireModules();
  }
}
