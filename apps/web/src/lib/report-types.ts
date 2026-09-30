export interface FunnelStage {
  stageId: string;
  name: string;
  type: "open" | "won" | "lost";
  count: number;
}

export interface PipelineFunnel {
  pipelineId: string;
  pipelineName: string;
  stages: FunnelStage[];
}

export interface BotDropoff {
  runsByStatus: { status: string; count: number }[];
  stepFunnel: { blockId: string; type: string; status: string; count: number }[];
}

export interface TeamPerformanceRow {
  userId: string;
  name: string | null;
  email: string;
  role: string;
  totalLeads: number;
  won: number;
  lost: number;
  avgResponseMinutes: number | null;
}

export interface LostReasonRow {
  reason: string;
  count: number;
}
