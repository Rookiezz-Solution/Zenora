import { matchesCondition, type LeadRoutingContext, type RoutingCondition } from "./routing";

// CRM-event triggers: an automation that starts because something happened to a
// lead (a tag was added, it moved to a stage, its score reached a level) rather
// than because of a message. The API and the worker both raise these, so the
// matching rules live here once.

export interface StageChangedTriggerConfig {
  stageId: string | null; // null = any stage
}

export interface ScoreReachedTriggerConfig {
  threshold: number; // fires when the score crosses up to this level
}

export type ConditionMode = "all" | "any";

// What happened. Only the fields relevant to the event are set.
export interface CrmEvent {
  tagName?: string;
  stageId?: string;
  scoreBefore?: number;
  scoreAfter?: number;
}

export const CRM_EVENT_TYPES = ["tag_added", "stage_changed", "score_reached"] as const;
export type CrmEventType = (typeof CRM_EVENT_TYPES)[number];

export function matchesCrmEvent(type: CrmEventType, config: Record<string, unknown> | undefined, event: CrmEvent): boolean {
  if (!config) return false;
  switch (type) {
    case "tag_added": {
      const tagName = config.tagName;
      return !tagName || tagName === event.tagName; // empty = any tag
    }
    case "stage_changed": {
      const stageId = config.stageId;
      return !stageId || stageId === event.stageId; // empty = any stage
    }
    case "score_reached": {
      const threshold = config.threshold;
      if (typeof threshold !== "number" || event.scoreBefore === undefined || event.scoreAfter === undefined) return false;
      // Only the moment of crossing: a lead that is already above the line does not fire again.
      return event.scoreBefore < threshold && event.scoreAfter >= threshold;
    }
  }
}

// The extra conditions on a trigger: every one must hold ("all", the default) or
// at least one ("any"). No conditions means no extra restriction.
export function conditionsPass(conditions: RoutingCondition[] | undefined, mode: ConditionMode | undefined, context: LeadRoutingContext): boolean {
  if (!conditions || conditions.length === 0) return true;
  return mode === "any" ? conditions.some((c) => matchesCondition(c, context)) : conditions.every((c) => matchesCondition(c, context));
}
