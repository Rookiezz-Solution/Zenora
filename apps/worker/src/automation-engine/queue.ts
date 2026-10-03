import { Queue } from "bullmq";
import { createRedisConnection } from "../redis";

const queue = new Queue("automation-engine", { connection: createRedisConnection() });

export async function enqueueStart(automationId: string, leadId: string, conversationId: string, delayMs = 0) {
  await queue.add("start", { automationId, leadId, conversationId }, delayMs > 0 ? { delay: delayMs } : undefined);
}

export async function enqueueResume(runId: string, blockId: string, delayMinutes: number) {
  await queue.add("resume", { runId, blockId }, { delay: delayMinutes * 60_000 });
}
