// Follow-up sequences (docs/ROADMAP.md Phase 1 item 8) — a linear list of
// timed steps, deliberately simpler than the automation engine's branching
// flow graph (Phase 1 item 5): sequences are "wait then do this," not a
// decision tree.

export const SEQUENCE_ACTION_TYPES = ["send_text", "tag", "create_task"] as const;
export type SequenceActionType = (typeof SEQUENCE_ACTION_TYPES)[number];

export interface SendTextAction {
  type: "send_text";
  body: string;
}

export interface TagAction {
  type: "tag";
  tagName: string;
}

export interface CreateTaskAction {
  type: "create_task";
  title: string;
}

export type SequenceAction = SendTextAction | TagAction | CreateTaskAction;

export interface SequenceStep {
  waitHours: number;
  action: SequenceAction;
}
