// Central registry of feature flag keys so app/api/worker agree on names.
// Phase 0: flags are read from the `feature_flags` table (global or
// per-workspace override); no UI to manage them yet.
export const FEATURE_FLAGS = [
  "ai_replies",
  "meeting_bot",
  "telephony",
  "broadcasts",
  "agency_workspaces",
  "audience_sync"
] as const;
export type FeatureFlag = (typeof FEATURE_FLAGS)[number];
