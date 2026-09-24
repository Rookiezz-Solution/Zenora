import { Worker, type Job } from "bullmq";
import { createRedisConnection } from "./redis";
import { processMetaWebhookEvent } from "./processors/webhook-event";
import { QUEUE_NAMES, type QueueName } from "./queues";

const connection = createRedisConnection();

async function placeholderProcessor(job: Job) {
  console.log(`[${job.queueName}] received "${job.name}" (Phase 1+ processor not implemented yet)`, job.data);
}

// Real processors land here as each service is built; queues without one
// yet keep logging instead of erroring, per QUEUE_NAMES in @zenora/shared.
const PROCESSORS: Partial<Record<QueueName, (job: Job) => Promise<void>>> = {
  "webhook-ingress": async (job) => {
    const { eventId } = job.data as { eventId: string };
    await processMetaWebhookEvent(eventId);
  }
};

const workers = QUEUE_NAMES.map(
  (queueName) => new Worker(queueName, PROCESSORS[queueName] ?? placeholderProcessor, { connection })
);

console.log(`Zenora worker listening on queues: ${QUEUE_NAMES.join(", ")}`);

async function shutdown() {
  console.log("Shutting down worker...");
  await Promise.all(workers.map((w) => w.close()));
  await connection.quit();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
