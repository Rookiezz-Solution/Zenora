import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { Queue } from "bullmq";
import IORedis from "ioredis";
import { QUEUE_NAMES, type QueueName } from "@zenora/shared";
import { loadEnv } from "../config/env";

@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly connection = new IORedis(loadEnv().REDIS_URL, { maxRetriesPerRequest: null });
  private readonly queues = new Map<QueueName, Queue>(
    QUEUE_NAMES.map((name) => [name, new Queue(name, { connection: this.connection })])
  );

  async add(queueName: QueueName, jobName: string, data: unknown, delayMs = 0) {
    const queue = this.queues.get(queueName);
    if (!queue) throw new Error(`Unknown queue: ${queueName}`);
    return queue.add(jobName, data, delayMs > 0 ? { delay: delayMs } : undefined);
  }

  async onModuleDestroy() {
    await Promise.all([...this.queues.values()].map((q) => q.close()));
    await this.connection.quit();
  }
}
