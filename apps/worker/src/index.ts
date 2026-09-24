import { Worker, type Job } from "bullmq";
import { createRedisConnection } from "./redis";
import { QUEUE_NAMES } from "./queues";

const connection = createRedisConnection();

async function placeholderProcessor(job: Job) {
  console.log(`[${job.queueName}] received "${job.name}" (Phase 1+ processor not implemented yet)`, job.data);
}

const workers = QUEUE_NAMES.map(
  (queueName) => new Worker(queueName, placeholderProcessor, { connection })
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
