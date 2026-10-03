export interface ApiKeyRow {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export interface CreatedApiKey extends ApiKeyRow {
  key: string;
}

export interface WebhookRow {
  id: string;
  url: string;
  description: string | null;
  events: string[];
  active: boolean;
  createdAt: string;
}

export interface CreatedWebhook extends WebhookRow {
  secret: string;
}

export interface DeliveryRow {
  id: string;
  event: string;
  status: "pending" | "retrying" | "delivered" | "failed";
  attempts: number;
  responseStatus: number | null;
  error: string | null;
  createdAt: string;
  deliveredAt: string | null;
}

export const SCOPE_LABELS: Record<string, string> = {
  "leads:read": "Read leads",
  "leads:write": "Create leads"
};

export const DELIVERY_STATUS_STYLES: Record<DeliveryRow["status"], string> = {
  pending: "bg-gray-100 text-gray-700",
  retrying: "bg-amber-50 text-amber-800",
  delivered: "bg-green-50 text-green-800",
  failed: "bg-red-50 text-red-800"
};
