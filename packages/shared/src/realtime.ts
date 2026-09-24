// Redis pub/sub channel both apps/api (publisher on outbound send, and
// subscriber that forwards to Socket.IO clients) and apps/worker (publisher
// on inbound webhook messages) agree on.
export const REALTIME_CHANNEL = "zenora:inbox-events";

export const INBOX_EVENT_TYPES = ["message.created", "conversation.updated"] as const;
export type InboxEventType = (typeof INBOX_EVENT_TYPES)[number];

export interface InboxRealtimeEvent {
  workspaceId: string;
  type: InboxEventType;
  payload: unknown;
}
