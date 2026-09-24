export interface Lead {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
}

export interface Message {
  id: string;
  conversationId: string;
  direction: "inbound" | "outbound";
  type: string;
  body: string | null;
  status: string;
  createdAt: string;
}

export interface Conversation {
  id: string;
  workspaceId: string;
  leadId: string | null;
  channel: "instagram" | "whatsapp";
  windowExpiresAt: string | null;
  botActive: boolean;
  assignedToId: string | null;
  updatedAt: string;
  lead: Lead | null;
  messages: Message[]; // last message only, from the list endpoint
}

export interface QuickReply {
  id: string;
  shortcut: string;
  body: string;
  mediaUrl: string | null;
}

export interface WaTemplate {
  id: string;
  name: string;
  language: string;
  bodyText: string;
}

export type ConversationFilter = "all" | "mine" | "unassigned" | "bot_active" | "waiting_on_us";
