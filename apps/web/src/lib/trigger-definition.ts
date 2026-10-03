export type TriggerKind = "whatsapp_message_keyword" | "instagram_dm_keyword" | "tag_added";
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
  conditions: TriggerCondition[];
  onceForLead: boolean;
  delayMinutes: string; // empty = no delay
}

export const EMPTY_TRIGGER: TriggerDefinition = {
  type: "whatsapp_message_keyword",
  keywords: "",
  matchType: "contains",
  tagName: "",
  conditions: [],
  onceForLead: false,
  delayMinutes: ""
};

export const TRIGGER_LABELS: Record<TriggerKind, string> = {
  whatsapp_message_keyword: "WhatsApp message",
  instagram_dm_keyword: "Instagram DM",
  tag_added: "Tag added to a lead"
};

export interface TriggerPayload {
  type: TriggerKind;
  config: { keywords: string[]; matchType: KeywordMatch } | { tagName: string | null };
  conditions?: TriggerCondition[];
  limits?: { onceForLead?: boolean; delayMinutes?: number };
}

export function toTriggerPayload(def: TriggerDefinition): TriggerPayload {
  const conditions = def.conditions.filter((c) => c.value.trim() !== "");
  const delay = Number.parseInt(def.delayMinutes, 10);
  const limits = {
    ...(def.onceForLead ? { onceForLead: true } : {}),
    ...(Number.isFinite(delay) && delay > 0 ? { delayMinutes: delay } : {})
  };
  return {
    type: def.type,
    config:
      def.type === "tag_added"
        ? { tagName: def.tagName.trim() || null }
        : { keywords: def.keywords.split(",").map((k) => k.trim()).filter(Boolean), matchType: def.matchType },
    ...(conditions.length > 0 ? { conditions } : {}),
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
    conditions: Array.isArray(c.conditions) ? (c.conditions as TriggerCondition[]) : [],
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
