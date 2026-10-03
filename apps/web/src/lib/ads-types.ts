export interface AdAccountRow {
  id: string;
  externalAccountId: string;
  name: string | null;
  currency: string | null;
  status: "inactive" | "active" | "error";
  lastSyncedAt: string | null;
  lastError: string | null;
  tokenExpiresAt: string | null;
}

export interface CampaignRow {
  campaignId: string;
  campaignName: string;
  currency: string;
  spendMinor: number;
  impressions: number;
  clicks: number;
  leads: number;
  appointments: number;
  won: number;
  costPerLeadMinor: number | null;
  costPerAppointmentMinor: number | null;
  costPerWonMinor: number | null;
}

export interface AdsReport {
  days: number;
  campaigns: CampaignRow[];
  unmatchedAdLeads: number;
  sources: { source: string; leads: number }[];
}

export interface AdsSyncResult {
  accounts: number;
  rows: number;
  errors: { account: string; message: string }[];
}

export function formatMoney(minor: number | null, currency: string): string {
  if (minor === null) return "—";
  return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 }).format(minor / 100);
}

const SOURCE_LABELS: Record<string, string> = {
  ad: "Meta ads",
  whatsapp: "WhatsApp (organic)",
  instagram: "Instagram (organic)",
  link_in_bio: "Link in bio",
  manual: "Added manually",
  import: "Imported"
};

export const sourceLabel = (s: string) => SOURCE_LABELS[s] ?? s.replace(/_/g, " ");
