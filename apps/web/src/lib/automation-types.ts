export type BlockType =
  | "send_text"
  | "send_quick_replies"
  | "condition"
  | "wait"
  | "tag"
  | "move_stage"
  | "assign"
  | "handover";

export interface QuickReplyOption {
  label: string;
  next: string | null;
}

export interface FlowBlock {
  id: string;
  type: BlockType;
  body?: string;
  options?: QuickReplyOption[];
  field?: "tag" | "stage" | "score";
  operator?: "equals" | "contains" | "gte";
  value?: string;
  ifTrue?: string | null;
  ifFalse?: string | null;
  minutes?: number;
  tagName?: string;
  stageId?: string;
  userId?: string | null;
  next?: string | null;
}

export interface FlowGraph {
  startBlockId: string;
  blocks: Record<string, FlowBlock>;
}

export interface AutomationVersion {
  id: string;
  version: number;
  graph: FlowGraph;
  publishedAt: string | null;
  createdAt: string;
}

export interface Automation {
  id: string;
  workspaceId: string;
  name: string;
  folder: string | null;
  status: "draft" | "live" | "scheduled" | "paused";
  triggerId: string | null;
  trigger: { id: string; type: string; config: { keywords: string[]; matchType: string } } | null;
  draft: AutomationVersion | null;
  latestVersion?: AutomationVersion | null;
  runCount?: number;
}

export interface FlowTemplate {
  id: string;
  workspaceId: string | null;
  name: string;
  industry: string | null;
  scope: "private" | "agency" | "public";
  graph: FlowGraph;
  variables: Record<string, string>;
  createdAt: string;
}

export interface RunStep {
  id: string;
  blockId: string;
  type: string;
  status: string;
  output: Record<string, unknown> | null;
  startedAt: string;
}

export interface TestRunResult {
  runId: string;
  steps: Array<{ blockId: string; type: string; output: Record<string, unknown> }>;
}

export interface AutomationStats {
  runsByStatus: Record<string, number>;
  stepFunnel: Array<{ blockId: string; type: string; status: string; count: number }>;
  recentRuns: Array<{ id: string; status: string; startedAt: string; lead: { id: string; name: string | null; phone: string | null } | null }>;
}
