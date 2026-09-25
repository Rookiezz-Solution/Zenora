export type RoutingConditionField = "source" | "tag" | "customField";
export type RoutingConditionOperator = "equals" | "contains";

export interface RoutingCondition {
  field: RoutingConditionField;
  operator: RoutingConditionOperator;
  value: string;
  fieldId?: string;
}

export type AssignToType = "user" | "team" | "least_busy" | "round_robin";

export interface AssignTo {
  type: AssignToType;
  targetId?: string;
}

export interface RoutingRule {
  id: string;
  workspaceId: string;
  order: number;
  conditions: RoutingCondition[];
  assignTo: AssignTo;
  createdAt: string;
}

export interface ScoringRule {
  id: string;
  workspaceId: string;
  condition: RoutingCondition;
  points: number;
  createdAt: string;
}

export interface Member {
  id: string;
  userId: string;
  role: string;
  available: boolean;
  user: { id: string; name: string | null; email: string };
}
