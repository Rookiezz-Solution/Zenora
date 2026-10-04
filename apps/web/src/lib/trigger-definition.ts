export type TriggerKind = "whatsapp_message_keyword" | "instagram_dm_keyword" | "tag_added" | "stage_changed" | "score_reached";
export type ConditionMode = "all" | "any";
export type KeywordMatch = "contains" | "exact" | "any";

export interface TriggerCondition {
  field: "source" | "tag" | "customField";
  operator: "equals" | "contains";
  value: string;
  fieldId?: string;
}

// Editor-side state: text inputs stay strings until they're converted into
// the API payload.
export interface TriggerDefinition {
  type: TriggerKind;
  keywords: string;
  matchType: KeywordMatch;
  tagName: string; // empty = any tag
  stageId: string; // empty = any stage
  scoreThreshold: string;
  conditions: TriggerCondition[];
  conditionMode: ConditionMode;
  onceForLead: boolean;
  delayMinutes: string; // empty = no delay
}

export const EMPTY_TRIGGER: TriggerDefinition = {
  type: "whatsapp_message_keyword",
  keywords: "",
  matchType: "contains",
  tagName: "",
  stageId: "",
  scoreThreshold: "50",
  conditions: [],
  conditionMode: "all",
  onceForLead: false,
  delayMinutes: ""
};

export const TRIGGER_LABELS: Record<TriggerKind, string> = {
  whatsapp_message_keyword: "WhatsApp message",
  instagram_dm_keyword: "Instagram DM",
  tag_added: "Tag added to a lead",
  stage_changed: "Lead moved to a stage",
  score_reached: "Lead score reaches a level"
};

// The ones that start from something happening to a lead rather than from a message.
export const isEventTrigger = (type: TriggerKind) => type === "tag_added" || type === "stage_changed" || type === "score_reached";

export interface TriggerPayload {
  type: TriggerKind;
  config: { keywords: string[]; matchType: KeywordMatch } | { tagName: string | null } | { stageId: string | null } | { threshold: number };
  conditions?: TriggerCondition[];
  conditionMode?: ConditionMode;
  limits?: { onceForLead?: boolean; delayMinutes?: number };
}

export function toTriggerPayload(def: TriggerDefinition): TriggerPayload {
  const conditions = def.conditions.filter((c) => c.value.trim() !== "");
  const delay = Number.parseInt(def.delayMinutes, 10);
  const limits = {
    ...(def.onceForLead ? { onceForLead: true } : {}),
    ...(Number.isFinite(delay) && delay > 0 ? { delayMinutes: delay } : {})
  };
  const config: TriggerPayload["config"] =
    def.type === "tag_added"
      ? { tagName: def.tagName.trim() || null }
      : def.type === "stage_changed"
        ? { stageId: def.stageId || null }
        : def.type === "score_reached"
          ? { threshold: Number.parseInt(def.scoreThreshold, 10) || 0 }
          : { keywords: def.keywords.split(",").map((k) => k.trim()).filter(Boolean), matchType: def.matchType };
  return {
    type: def.type,
    config,
    ...(conditions.length > 0 ? { conditions, conditionMode: def.conditionMode } : {}),
    ...(Object.keys(limits).length > 0 ? { limits } : {})
  };
}

// Inverse of toTriggerPayload, for loading a stored Trigger or SavedTrigger.
export function fromStored(type: string, config: Record<string, unknown> | null | undefined): TriggerDefinition {
  const c = config ?? {};
  const limits = (c.limits ?? {}) as { onceForLead?: boolean; delayMinutes?: number };
  const kind = (type in TRIGGER_LABELS ? type : "whatsapp_message_keyword") as TriggerKind;
  return {
    type: kind,
    keywords: Array.isArray(c.keywords) ? (c.keywords as string[]).join(", ") : "",
    matchType: (c.matchType as KeywordMatch | undefined) ?? "contains",
    tagName: typeof c.tagName === "string" ? c.tagName : "",
    stageId: typeof c.stageId === "string" ? c.stageId : "",
    scoreThreshold: typeof c.threshold === "number" ? String(c.threshold) : "50",
    conditions: Array.isArray(c.conditions) ? (c.conditions as TriggerCondition[]) : [],
    conditionMode: c.conditionMode === "any" ? "any" : "all",
    onceForLead: limits.onceForLead === true,
    delayMinutes: limits.delayMinutes ? String(limits.delayMinutes) : ""
  };
}

export interface SavedTrigger {
  id: string;
  name: string;
  type: string;
  config: Record<string, unknown>;
}
