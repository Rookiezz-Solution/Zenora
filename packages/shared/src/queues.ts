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
  "sequences"
] as const;
export type QueueName = (typeof QUEUE_NAMES)[number];
