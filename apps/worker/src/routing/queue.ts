import { Queue } from "bullmq";
import { createRedisConnection } from "../redis";

const routingQueue = new Queue("routing", { connection: createRedisConnection() });
const sequencesQueue = new Queue("sequences", { connection: createRedisConnection() });

export async function enqueueSalespersonAlert(workspaceId: string, leadId: string, userId: string, note?: string) {
  await routingQueue.add("salesperson_alert", { workspaceId, leadId, userId, note });
}

export async function enqueueSlaCheck(slaTimerId: string, delayMs: number) {
  await routingQueue.add("sla_check", { slaTimerId }, { delay: delayMs });
}

export async function enqueueSequenceStep(enrollmentId: string, delayMs: number) {
  await sequencesQueue.add("step", { enrollmentId }, { delay: delayMs });
}
