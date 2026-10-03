export type IntegrationStatus = "configured" | "partial" | "missing" | "coming_soon";

export interface AdminIntegrationField {
  key: string;
  label: string;
  secret: boolean;
  help: string | null;
  configured: boolean;
  source: "dashboard" | "env" | "none";
  value: string | null; // null for secrets, always
}

export interface AdminIntegrationGroup {
  id: string;
  title: string;
  description: string;
  status: IntegrationStatus;
  restartRequired: boolean;
  setupLinks: { label: string; url: string }[];
  fields: AdminIntegrationField[];
}
