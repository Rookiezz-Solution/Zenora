// Queue names, one per background service in docs/ARCHITECTURE.md. Phase 0
// only registers the workers; Phase 1+ fill in real processors as each
// service (automation engine, webhook ingress, ...) gets built.
export const QUEUE_NAMES = [
  "automation-engine",
  "webhook-ingress",
  "ai",
  "transcription",
  "broadcasts",
  "billing"
] as const;
export type QueueName = (typeof QUEUE_NAMES)[number];
