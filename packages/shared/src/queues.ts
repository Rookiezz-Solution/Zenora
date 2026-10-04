// BullMQ queue names, one per background service in docs/ARCHITECTURE.md.
// Shared between apps/api (producer) and apps/worker (consumer) so they can
// never drift apart.
export const QUEUE_NAMES = [
  "automation-engine",
  "webhook-ingress",
  "ai",
  "transcription",
  "broadcasts",
  "billing",
  "routing",
  "sequences",
  "appointments",
  "webhooks",
  "privacy"
] as const;
export type QueueName = (typeof QUEUE_NAMES)[number];

// The worker refreshes this Redis key every 30 s (it expires after 2 minutes), so
// the API's /health/ready can say whether background jobs are being processed.
export const WORKER_HEARTBEAT_KEY = "zenora:worker:heartbeat";
export const WORKER_HEARTBEAT_EVERY_MS = 30_000;
export const WORKER_HEARTBEAT_TTL_S = 120;
