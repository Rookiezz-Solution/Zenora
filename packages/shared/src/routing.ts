// Rule-based scoring + routing (docs/ROADMAP.md Phase 1 item 8). AI intent
// bonus scoring is Phase 2 territory (needs the AI service) — this is the
// points-per-condition half of docs/PRD.md section 10 only.

export const ROUTING_CONDITION_FIELDS = ["source", "tag", "customField"] as const;
export type RoutingConditionField = (typeof ROUTING_CONDITION_FIELDS)[number];

export const ROUTING_CONDITION_OPERATORS = ["equals", "contains"] as const;
export type RoutingConditionOperator = (typeof ROUTING_CONDITION_OPERATORS)[number];

// `fieldId` is required (and only meaningful) when field === "customField" —
// covers interest/language/budget, all of which are workspace-defined custom
// fields rather than columns on Lead.
export interface RoutingCondition {
  field: RoutingConditionField;
  operator: RoutingConditionOperator;
  value: string;
  fieldId?: string;
}

export interface LeadRoutingContext {
  source: string | null;
  tags: string[];
  customFieldValues: Record<string, string>;
}

export function matchesCondition(condition: RoutingCondition, context: LeadRoutingContext): boolean {
  const actual =
    condition.field === "source"
      ? context.source
      : condition.field === "tag"
        ? context.tags.join(",")
        : (condition.fieldId ? context.customFieldValues[condition.fieldId] : undefined) ?? null;

  if (actual == null) return false;
  return condition.operator === "equals" ? actual === condition.value : actual.toLowerCase().includes(condition.value.toLowerCase());
}

export interface ScoringRuleInput {
  condition: RoutingCondition;
  points: number;
}

export function computeScore(rules: ScoringRuleInput[], context: LeadRoutingContext): number {
  return rules.reduce((total, rule) => (matchesCondition(rule.condition, context) ? total + rule.points : total), 0);
}

export const ASSIGN_TO_TYPES = ["user", "team", "least_busy", "round_robin"] as const;
export type AssignToType = (typeof ASSIGN_TO_TYPES)[number];

export interface AssignTo {
  type: AssignToType;
  targetId?: string;
}

export interface RoutingRuleInput {
  conditions: RoutingCondition[];
  assignTo: AssignTo;
}

// First rule whose conditions all match wins (conditions within a rule are
// ANDed) — ordered list, so caller passes rules already sorted by `order`.
export function matchRoutingRule(rules: RoutingRuleInput[], context: LeadRoutingContext): AssignTo | null {
  const matched = rules.find((rule) => rule.conditions.every((c) => matchesCondition(c, context)));
  return matched?.assignTo ?? null;
}

// Both fallback strategies operate on a candidate list the caller already
// filtered to "available" members (docs/PRD.md's team availability toggle) —
// these two functions are pure selection only, no DB access.
export interface RoutingCandidate {
  userId: string;
  openLeadCount: number;
}

export function pickLeastBusy(candidates: RoutingCandidate[]): string | null {
  if (candidates.length === 0) return null;
  return candidates.reduce((best, c) => (c.openLeadCount < best.openLeadCount ? c : best)).userId;
}

// Approximated with assignment-count modulo rather than a stored rotation
// pointer — good enough for a fair-ish spread without extra state, and
// deterministic (candidates sorted by userId) so it's testable.
export function pickRoundRobin(candidates: RoutingCandidate[], totalAssignmentsSoFar: number): string | null {
  if (candidates.length === 0) return null;
  const sorted = [...candidates].sort((a, b) => a.userId.localeCompare(b.userId));
  return sorted[totalAssignmentsSoFar % sorted.length]!.userId;
}
