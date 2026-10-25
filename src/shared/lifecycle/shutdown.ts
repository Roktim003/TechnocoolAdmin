/**
 * Graceful shutdown for the web and worker processes.
 *
 * On SIGTERM: stop taking work (the readiness probe turns 503 and new API requests are refused
 * with 503), wait for in-flight requests / jobs to finish (bounded by a timeout), then run the
 * closers in reverse registration order (workers → queues → Redis → Prisma) and exit.
 */

type Closer = { name: string; close: () => Promise<unknown> };

interface LifecycleState {
  draining: boolean;
  inFlight: number;
  closers: Closer[];
  idle: (() => void)[];
  shutdown?: Promise<void>;
  startedAt: number;
}

const g = globalThis as unknown as { __sbLifecycle?: LifecycleState };
const state = (): LifecycleState => (g.__sbLifecycle ??= { draining: false, inFlight: 0, closers: [], idle: [], startedAt: Date.now() });

export const isDraining = () => state().draining;
export const inFlight = () => state().inFlight;
export const processStartedAt = () => new Date(state().startedAt);

/** Registers a resource to close on shutdown (closed in reverse order of registration). */
export function onShutdown(name: string, close: () => Promise<unknown>): void {
  state().closers.push({ name, close });
}

/** Counts a request (or job) as in flight; call the returned function when it ends. */
export function trackInFlight(): () => void {
  const s = state();
  s.inFlight++;
  let done = false;
  return () => {
    if (done) return;
    done = true;
    s.inFlight--;
    if (s.inFlight === 0) for (const resolve of s.idle.splice(0)) resolve();
  };
}

function waitForIdle(timeoutMs: number): Promise<boolean> {
  const s = state();
  if (s.inFlight === 0) return Promise.resolve(true);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), timeoutMs);
    s.idle.push(() => {
      clearTimeout(timer);
      resolve(true);
    });
  });
}

export interface ShutdownOptions {
  timeoutMs: number;
  log?: { info: (o: object, m: string) => void; warn: (o: object, m: string) => void; error: (o: object, m: string) => void };
  /** Called before waiting for in-flight work (e.g. pause the BullMQ workers). */
  beforeDrain?: () => Promise<void>;
  exit?: (code: number) => void;
}

/** Runs the shutdown once; later calls return the same promise. */
export function shutdown(signal: string, o: ShutdownOptions): Promise<void> {
  const s = state();
  s.shutdown ??= (async () => {
    s.draining = true;
    o.log?.info({ signal, inFlight: s.inFlight }, "shutting down: no new work accepted");
    const deadline = Date.now() + o.timeoutMs;
    await o.beforeDrain?.().catch((err) => o.log?.error({ err }, "error while stopping intake"));
    const drained = await waitForIdle(Math.max(0, deadline - Date.now()));
    if (!drained) o.log?.warn({ inFlight: s.inFlight }, "shutdown timeout: closing with work still in flight");
    let code = 0;
    for (const c of [...s.closers].reverse()) {
      try {
        await Promise.race([c.close(), new Promise((_, reject) => setTimeout(() => reject(new Error("close timeout")), 5000))]);
      } catch (err) {
        code = 1;
        o.log?.error({ err, resource: c.name }, "could not close cleanly");
      }
    }
    o.log?.info({ signal, drained }, "shutdown complete");
    (o.exit ?? process.exit)(code);
  })();
  return s.shutdown;
}

/** Tests only. */
export function resetLifecycle(): void {
  g.__sbLifecycle = undefined;
}
