import { afterEach, describe, expect, it } from "vitest";
import { Queue, Worker } from "bullmq";
import { bullConnection } from "@/shared/redis/redis";
import { queuePrefix } from "@/shared/queue/queue";
import { authedRoute } from "@/shared/http/route";
import { onShutdown, resetLifecycle, shutdown } from "@/shared/lifecycle/shutdown";
import { call } from "../helpers/http";
import { resetDatabase } from "../helpers/db";
import { adminToken } from "../helpers/fixtures";

/*
 * Graceful shutdown on SIGTERM, with real BullMQ workers and real route handlers (the signal
 * handler itself is a one-liner around `shutdown()`).
 */

const QUEUE = "shutdown-test";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

afterEach(async () => {
  resetLifecycle();
  const q = new Queue(QUEUE, { connection: bullConnection(), prefix: queuePrefix() });
  await q.obliterate({ force: true }).catch(() => undefined);
  await q.close();
});

describe("graceful shutdown", () => {
  it("web: in-flight requests finish, new ones get 503, then connections close", async () => {
    await resetDatabase();
    const token = await adminToken();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const slow = authedRoute({}, async () => {
      await gate;
      return { data: { finished: true } };
    });
    const fast = authedRoute({}, async () => ({ data: { ok: true } }));

    const order: string[] = [];
    onShutdown("prisma", async () => void order.push("prisma closed"));
    onShutdown("redis", async () => void order.push("redis closed"));

    const inFlight = call(slow, "GET", "/slow", { token });
    await sleep(50);
    const stopping = shutdown("SIGTERM", { timeoutMs: 5000, exit: (code) => void order.push(`exit ${code}`) });

    const refused = await call(fast, "GET", "/fast", { token });
    expect(refused.status).toBe(503);
    expect(refused.headers.get("retry-after")).toBe("5");
    expect(order).toEqual([]);

    release();
    expect((await inFlight).body.data).toEqual({ finished: true });
    await stopping;
    expect(order).toEqual(["redis closed", "prisma closed", "exit 0"]);
  });

  it("worker: the running job finishes before the process exits", async () => {
    const q = new Queue(QUEUE, { connection: bullConnection(), prefix: queuePrefix() });
    const done: string[] = [];
    const worker = new Worker(
      QUEUE,
      async (job) => {
        done.push(`started ${job.id}`);
        await sleep(800);
        done.push(`finished ${job.id}`);
      },
      { connection: bullConnection(), prefix: queuePrefix() },
    );
    await q.add("slow", {}, { jobId: "j1" });
    while (!done.includes("started j1")) await sleep(20);

    onShutdown("redis", async () => void done.push("connections closed"));
    await shutdown("SIGTERM", { timeoutMs: 5000, exit: () => undefined, beforeDrain: () => worker.close() });
    expect(done).toEqual(["started j1", "finished j1", "connections closed"]);
    expect(await (await q.getJob("j1"))!.getState()).toBe("completed");
    await q.close();
  });

  it("worker: a job still running at the timeout is released back to the queue and picked up again", async () => {
    const q = new Queue(QUEUE, { connection: bullConnection(), prefix: queuePrefix() });
    const opts = { connection: bullConnection(), prefix: queuePrefix(), lockDuration: 1000, stalledInterval: 500, maxStalledCount: 3 };
    let runs = 0;
    const stuck = new Worker(QUEUE, async () => {
      runs++;
      await sleep(10_000);
    }, opts);
    await q.add("long", {}, { jobId: "j2" });
    while (runs === 0) await sleep(20);

    // Same strategy as src/worker/index.ts: graceful close, forced past the timeout.
    await shutdown("SIGTERM", {
      timeoutMs: 300,
      exit: () => undefined,
      beforeDrain: async () => {
        const finished = await Promise.race([stuck.close().then(() => true), sleep(300).then(() => false)]);
        if (!finished) await stuck.disconnect();
      },
    });

    // A fresh worker (the restarted container) finishes it.
    let finished = false;
    const next = new Worker(QUEUE, async () => void (finished = true), opts);
    for (let i = 0; i < 100 && !finished; i++) await sleep(100);
    await next.close();
    expect(finished).toBe(true);
    expect(await (await q.getJob("j2"))!.getState()).toBe("completed");
    await q.close();
  }, 30_000);
});
