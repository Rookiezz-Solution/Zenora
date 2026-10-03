import { Queue } from "bullmq";
import { createRedisConnection } from "../redis";

const webhooksQueue = new Queue("webhooks", { connection: createRedisConnection() });

export async function enqueueWebhookDelivery(deliveryId: string, delayMs = 0) {
  await webhooksQueue.add("deliver", { deliveryId }, delayMs > 0 ? { delay: delayMs } : undefined);
}
