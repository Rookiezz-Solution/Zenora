// Flow builder contract shared by apps/api (validates + persists),
// apps/worker (executes), and apps/web (renders/edits). docs/ROADMAP.md
// Phase 1 item 5 scopes this to "core blocks" — no AI blocks (Phase 2) or
// catalog/payment/WhatsApp-Flows blocks (need integrations we don't have
// yet). Branching keeps the graph simple: every block points to the next
// block id(s) directly rather than a separate edge list.

export const BLOCK_TYPES = [
  "send_text",
  "send_quick_replies",
  "condition",
  "wait",
  "tag",
  "move_stage",
  "assign",
  "handover"
] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];

interface FlowBlockBase {
  id: string;
}

export interface SendTextBlock extends FlowBlockBase {
  type: "send_text";
  body: string;
  next: string | null;
}

export interface QuickReplyOption {
  label: string;
  next: string | null;
}

// Max 3 options, matching docs/PRD.md's "reply buttons (max 3)".
export interface SendQuickRepliesBlock extends FlowBlockBase {
  type: "send_quick_replies";
  body: string;
  options: QuickReplyOption[];
}

export const CONDITION_FIELDS = ["tag", "stage", "score"] as const;
export type ConditionField = (typeof CONDITION_FIELDS)[number];

export const CONDITION_OPERATORS = ["equals", "contains", "gte"] as const;
export type ConditionOperator = (typeof CONDITION_OPERATORS)[number];

export interface ConditionBlock extends FlowBlockBase {
  type: "condition";
  field: ConditionField;
  operator: ConditionOperator;
  value: string;
  ifTrue: string | null;
  ifFalse: string | null;
}

export interface WaitBlock extends FlowBlockBase {
  type: "wait";
  minutes: number;
  next: string | null;
}

export interface TagBlock extends FlowBlockBase {
  type: "tag";
  tagName: string;
  next: string | null;
}

export interface MoveStageBlock extends FlowBlockBase {
  type: "move_stage";
  stageId: string;
  next: string | null;
}

export interface AssignBlock extends FlowBlockBase {
  type: "assign";
  userId: string | null;
  next: string | null;
}

// Pauses the bot on the lead's conversation — docs/PRD.md: "hand over to
// human." Terminal by convention (no `next`): a human is driving from here.
export interface HandoverBlock extends FlowBlockBase {
  type: "handover";
}

export type FlowBlock =
  | SendTextBlock
  | SendQuickRepliesBlock
  | ConditionBlock
  | WaitBlock
  | TagBlock
  | MoveStageBlock
  | AssignBlock
  | HandoverBlock;

export interface FlowGraph {
  startBlockId: string;
  blocks: Record<string, FlowBlock>;
}

export const TRIGGER_TYPES = ["instagram_dm_keyword", "whatsapp_message_keyword", "tag_added"] as const;
export type TriggerType = (typeof TRIGGER_TYPES)[number];

export const KEYWORD_MATCH_TYPES = ["contains", "exact", "any"] as const;
export type KeywordMatchType = (typeof KEYWORD_MATCH_TYPES)[number];

export interface KeywordTriggerConfig {
  keywords: string[];
  matchType: KeywordMatchType;
}

// docs/PRD.md's Growth-section "custom trigger builder" CRM event source —
// fires when a tag is added to a lead (LeadsService.addTag). tagName: null
// means "any tag".
export interface TagAddedTriggerConfig {
  tagName: string | null;
}

// docs/PRD.md: "any event ... + AND/OR conditions on any field + limits
// (once per lead, working hours, delay)". v1 scope: AND-only conditions
// (reusing routing.ts's RoutingCondition/matchesCondition — same field set,
// same evaluation, one condition-matching primitive instead of a second),
// plus two of the three limits — onceForLead and delayMinutes. workingHours
// is deferred: the workspace has no working-hours schema yet, and OR-groups
// are deferred as a meaningfully bigger condition-builder UI (see
// docs/PROGRESS.md).
export interface TriggerLimits {
  onceForLead?: boolean;
  delayMinutes?: number;
}

export interface TriggerRunRecord {
  automationId: string;
  status: string;
}

// Shared by apps/worker's message-keyword matcher and apps/api's CRM-event
// (tag_added) matcher — same DI-boundary reason the DB-querying code around
// this stays duplicated between the two apps.
export function isTriggerAllowedToFire(automationId: string, limits: TriggerLimits | undefined, runs: TriggerRunRecord[]): boolean {
  const automationRuns = runs.filter((r) => r.automationId === automationId);
  if (limits?.onceForLead) return automationRuns.length === 0;
  return !automationRuns.some((r) => r.status === "running");
}

export function triggerDelayMs(limits: TriggerLimits | undefined): number {
  return (limits?.delayMinutes ?? 0) * 60_000;
}
