export type TemplateCategory = "marketing" | "utility" | "authentication";
export type HeaderType = "none" | "text" | "image" | "video" | "document";
export type ButtonType = "quick_reply" | "url" | "phone_number";

export interface TemplateButton {
  type: ButtonType;
  text: string;
  url?: string;
  phoneNumber?: string;
}

export interface WaTemplate {
  id: string;
  workspaceId: string;
  name: string;
  category: TemplateCategory;
  language: string;
  headerType: HeaderType;
  headerText: string | null;
  bodyText: string;
  footerText: string | null;
  buttons: TemplateButton[];
  metaStatus: "pending" | "approved" | "rejected";
  metaTemplateId: string | null;
  rejectionReason: string | null;
  submittedAt: string | null;
  createdAt: string;
}

export interface AudienceFilter {
  tag?: string;
  optedInOnly: boolean;
  skipRecentlyMessagedHours?: number;
}

export interface Broadcast {
  id: string;
  workspaceId: string;
  templateId: string;
  template: { name: string; category: TemplateCategory; language?: string };
  audienceFilter: AudienceFilter;
  scheduledAt: string | null;
  status: "draft" | "scheduled" | "sending" | "sent" | "failed";
  costEstimate: number | null;
  sentAt: string | null;
  createdAt: string;
  _count?: { recipients: number };
  recipients?: Array<{ id: string; leadId: string; status: string; lead: { id: string; name: string | null; phone: string | null } }>;
}
