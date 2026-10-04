import { Queue, Worker, type Job } from "bullmq";
import { resumeRun, startRun } from "./automation-engine/engine";
import { createRedisConnection } from "./redis";
import { processAdsSync } from "./processors/ads-sync";
import { processBroadcast } from "./processors/broadcast";
import { processKnowledgeSource } from "./processors/knowledge";
import { processReminderSweep } from "./processors/reminders";
import { processRetentionSweep } from "./processors/retention";
import { processWorkspaceDeletions } from "./processors/workspace-deletion";
import { processSubscriptionLifecycle } from "./processors/subscription-lifecycle";
import { processSalespersonAlert, processSlaCheck } from "./processors/routing";
import { processSequenceStep } from "./processors/sequence";
import { processWebhookDelivery } from "./processors/webhook-delivery";
import { processMetaWebhookEvent } from "./processors/webhook-event";
import { WORKER_HEARTBEAT_EVERY_MS, WORKER_HEARTBEAT_KEY, WORKER_HEARTBEAT_TTL_S } from "@zenora/shared";
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
  },
  "automation-engine": async (job) => {
    if (job.name === "start") {
      const { automationId, leadId, conversationId } = job.data as { automationId: string; leadId: string; conversationId: string };
      await startRun(automationId, leadId, conversationId);
    } else if (job.name === "resume") {
      const { runId, blockId } = job.data as { runId: string; blockId: string };
      await resumeRun(runId, blockId);
    }
  },
  broadcasts: async (job) => {
    const { broadcastId } = job.data as { broadcastId: string };
    await processBroadcast(broadcastId);
  },
  routing: async (job) => {
    if (job.name === "salesperson_alert") {
      const { workspaceId, leadId, userId, note } = job.data as { workspaceId: string; leadId: string; userId: string; note?: string };
      await processSalespersonAlert(workspaceId, leadId, userId, note);
    } else if (job.name === "sla_check") {
      const { slaTimerId } = job.data as { slaTimerId: string };
      await processSlaCheck(slaTimerId);
    }
  },
  sequences: async (job) => {
    const { enrollmentId } = job.data as { enrollmentId: string };
    await processSequenceStep(enrollmentId);
  },
  webhooks: async (job) => {
    const { deliveryId } = job.data as { deliveryId: string };
    await processWebhookDelivery(deliveryId);
  },
  privacy: async (job) => {
    if (job.name === "retention_sweep") await processRetentionSweep();
    else if (job.name === "workspace_deletion_sweep") await processWorkspaceDeletions();
    else if (job.name === "subscription_lifecycle_sweep") console.log("subscription lifecycle:", await processSubscriptionLifecycle());
  },
  ads: async (job) => {
    if (job.name === "ads_sync_sweep") console.log("ads sync:", await processAdsSync());
  },
  appointments: async (job) => {
    if (job.name === "reminder_sweep") await processReminderSweep();
  },
  ai: async (job) => {
    if (job.name === "process_knowledge_source") {
      const { sourceId } = job.data as { sourceId: string };
      await processKnowledgeSource(sourceId);
    }
  }
};

const workers = QUEUE_NAMES.map(
  (queueName) => new Worker(queueName, PROCESSORS[queueName] ?? placeholderProcessor, { connection })
);

// Idempotent: the same scheduler id just updates the existing schedule on restart.
const appointmentsQueue = new Queue("appointments", { connection: createRedisConnection() });
appointmentsQueue
  .upsertJobScheduler("reminder-sweep", { every: 5 * 60_000 }, { name: "reminder_sweep" })
  .catch((err) => console.error("Could not schedule the reminder sweep:", err));

const privacyQueue = new Queue("privacy", { connection: createRedisConnection() });
privacyQueue
  .upsertJobScheduler("retention-sweep", { every: 24 * 3_600_000 }, { name: "retention_sweep" })
  .catch((err) => console.error("Could not schedule the retention sweep:", err));
// Hourly, so a workspace is removed within an hour of its grace period ending.
privacyQueue
  .upsertJobScheduler("workspace-deletion-sweep", { every: 3_600_000 }, { name: "workspace_deletion_sweep" })
  .catch((err) => console.error("Could not schedule the workspace deletion sweep:", err));

// Every 6 hours: refresh ad spend for tracked Meta ad accounts.
const adsQueue = new Queue("ads", { connection: createRedisConnection() });
adsQueue
  .upsertJobScheduler("ads-sync-sweep", { every: 6 * 3_600_000 }, { name: "ads_sync_sweep" })
  .catch((err) => console.error("Could not schedule the ads sync:", err));

// Daily: trials, renewals, and the monthly AI-credit reset.
privacyQueue
  .upsertJobScheduler("subscription-lifecycle-sweep", { every: 24 * 3_600_000 }, { name: "subscription_lifecycle_sweep" })
  .catch((err) => console.error("Could not schedule the subscription lifecycle sweep:", err));

// Lets the API report whether background jobs are being processed (GET /health/ready).
const heartbeat = () => void connection.set(WORKER_HEARTBEAT_KEY, String(Date.now()), "EX", WORKER_HEARTBEAT_TTL_S).catch(() => undefined);
heartbeat();
const heartbeatTimer = setInterval(heartbeat, WORKER_HEARTBEAT_EVERY_MS);

console.log(`Zenora worker listening on queues: ${QUEUE_NAMES.join(", ")}`);

async function shutdown() {
  console.log("Shutting down worker...");
  clearInterval(heartbeatTimer);
  await Promise.all(workers.map((w) => w.close()));
  await appointmentsQueue.close();
  await privacyQueue.close();
  await adsQueue.close();
  await connection.quit();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
