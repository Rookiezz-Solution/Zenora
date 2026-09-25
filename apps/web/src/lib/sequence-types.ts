export type SequenceActionType = "send_text" | "tag" | "create_task";

export type SequenceAction =
  | { type: "send_text"; body: string }
  | { type: "tag"; tagName: string }
  | { type: "create_task"; title: string };

export interface SequenceStep {
  waitHours: number;
  action: SequenceAction;
}

export interface Sequence {
  id: string;
  workspaceId: string;
  name: string;
  steps: SequenceStep[];
  createdAt: string;
  _count?: { enrollments: number };
  enrollments?: Array<{
    id: string;
    leadId: string;
    currentStep: number;
    status: "active" | "completed" | "stopped";
    enrolledAt: string;
    lead: { id: string; name: string | null; phone: string | null };
  }>;
}
