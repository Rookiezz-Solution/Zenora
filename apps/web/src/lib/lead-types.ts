export interface Tag {
  id: string;
  name: string;
  color: string | null;
}

export interface LeadTag {
  tag: Tag;
}

export interface Lead {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  source: string | null;
  score: number;
  createdAt: string;
  tags: LeadTag[];
}

export interface Note {
  id: string;
  body: string;
  createdAt: string;
  author: { id: string; name: string | null } | null;
}

export interface LeadIdentity {
  id: string;
  type: string;
  value: string;
}

export interface Consent {
  id: string;
  type: string;
  granted: boolean;
}

export interface LeadProfile extends Lead {
  identities: LeadIdentity[];
  notes: Note[];
  consents: Consent[];
}

export interface TimelineMessageEvent {
  type: "message";
  at: string;
  data: { id: string; direction: "inbound" | "outbound"; body: string | null; conversation: { channel: string } };
}
export interface TimelineNoteEvent {
  type: "note";
  at: string;
  data: Note;
}
export interface TimelineTaskEvent {
  type: "task";
  at: string;
  data: { id: string; title: string; dueAt: string | null; completedAt: string | null };
}
export type TimelineEvent = TimelineMessageEvent | TimelineNoteEvent | TimelineTaskEvent;
