/**
 * Enqueues a `ping` job and waits for the worker to finish it.
 * Usage: npm run queue:test   (the worker must be running: npm run worker)
 */
import { enqueueSystemJob, getQueue, queueEvents, QUEUES } from "@/shared/queue/queue";

async function main() {
  const events = queueEvents(QUEUES.system);
  await events.waitUntilReady();
  const job = await enqueueSystemJob("ping", { message: "hello from queue:test", requestedAt: new Date().toISOString() });
  console.log(`Enqueued job ${job.id}; waiting for the worker…`);
  const result = await job.waitUntilFinished(events, 15_000);
  console.log("Worker result:", result);
  await events.close();
  await getQueue(QUEUES.system).close();
  process.exit(0);
}

main().catch((err) => {
  console.error("Queue test failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
