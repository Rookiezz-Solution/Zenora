import { z } from "zod";
import { ASSIGN_TO_TYPES, ROUTING_CONDITION_FIELDS, ROUTING_CONDITION_OPERATORS } from "@zenora/shared";

const conditionSchema = z.object({
  field: z.enum(ROUTING_CONDITION_FIELDS),
  operator: z.enum(ROUTING_CONDITION_OPERATORS),
  value: z.string().min(1),
  fieldId: z.string().optional()
});

const assignToSchema = z.object({
  type: z.enum(ASSIGN_TO_TYPES),
  targetId: z.string().optional()
});

export const createRoutingRuleSchema = z.object({
  conditions: z.array(conditionSchema).min(1),
  assignTo: assignToSchema
});
export type CreateRoutingRuleDto = z.infer<typeof createRoutingRuleSchema>;

export const updateRoutingRuleSchema = createRoutingRuleSchema.partial();
export type UpdateRoutingRuleDto = z.infer<typeof updateRoutingRuleSchema>;

export const reorderRoutingRulesSchema = z.object({
  ruleIds: z.array(z.string()).min(1)
});
export type ReorderRoutingRulesDto = z.infer<typeof reorderRoutingRulesSchema>;

export const createScoringRuleSchema = z.object({
  condition: conditionSchema,
  points: z.number().int()
});
export type CreateScoringRuleDto = z.infer<typeof createScoringRuleSchema>;

export const updateScoringRuleSchema = createScoringRuleSchema.partial();
export type UpdateScoringRuleDto = z.infer<typeof updateScoringRuleSchema>;
