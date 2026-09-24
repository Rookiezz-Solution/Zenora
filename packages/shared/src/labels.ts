// Default terminology — every business can rename these (Settings > Industry
// and labels). Stored per-workspace; these are the shipped defaults.
export const DEFAULT_LABELS = {
  lead: "Lead",
  appointment: "Appointment",
  salesperson: "Salesperson",
  won: "Won",
  pipeline: "Pipeline",
  interest: "Interest"
} as const;

export type LabelKey = keyof typeof DEFAULT_LABELS;

export const INDUSTRY_STARTER_KITS = [
  "coaching",
  "clinic",
  "salon",
  "real_estate",
  "d2c",
  "travel",
  "creator",
  "local_services",
  "agency",
  "other"
] as const;
export type IndustryStarterKit = (typeof INDUSTRY_STARTER_KITS)[number];
