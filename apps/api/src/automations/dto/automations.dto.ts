import { z } from "zod";
import { CONDITION_FIELDS, CONDITION_OPERATORS, KEYWORD_MATCH_TYPES, ROUTING_CONDITION_FIELDS, ROUTING_CONDITION_OPERATORS } from "@zenora/shared";

export const createAutomationSchema = z.object({
  name: z.string().min(1),
  folder: z.string().optional()
});
export type CreateAutomationDto = z.infer<typeof createAutomationSchema>;

export const updateAutomationSchema = z.object({
  name: z.string().min(1).optional(),
  folder: z.string().nullable().optional()
});
export type UpdateAutomationDto = z.infer<typeof updateAutomationSchema>;

const blockIdRef = z.string().nullable();

const sendTextBlockSchema = z.object({
  id: z.string(),
  type: z.literal("send_text"),
  body: z.string().min(1),
  next: blockIdRef
});

const sendQuickRepliesBlockSchema = z.object({
  id: z.string(),
  type: z.literal("send_quick_replies"),
  body: z.string().min(1),
  options: z.array(z.object({ label: z.string().min(1), next: blockIdRef })).min(1).max(3)
});

const conditionBlockSchema = z.object({
  id: z.string(),
  type: z.literal("condition"),
  field: z.enum(CONDITION_FIELDS),
  operator: z.enum(CONDITION_OPERATORS),
  value: z.string(),
  ifTrue: blockIdRef,
  ifFalse: blockIdRef
});

const waitBlockSchema = z.object({
  id: z.string(),
  type: z.literal("wait"),
  minutes: z.number().int().positive(),
  next: blockIdRef
});

const tagBlockSchema = z.object({
  id: z.string(),
  type: z.literal("tag"),
  tagName: z.string().min(1),
  next: blockIdRef
});

const moveStageBlockSchema = z.object({
  id: z.string(),
  type: z.literal("move_stage"),
  stageId: z.string().min(1),
  next: blockIdRef
});

const assignBlockSchema = z.object({
  id: z.string(),
  type: z.literal("assign"),
  userId: z.string().nullable(),
  next: blockIdRef
});

const handoverBlockSchema = z.object({
  id: z.string(),
  type: z.literal("handover")
});

const flowBlockSchema = z.discriminatedUnion("type", [
  sendTextBlockSchema,
  sendQuickRepliesBlockSchema,
  conditionBlockSchema,
  waitBlockSchema,
  tagBlockSchema,
  moveStageBlockSchema,
  assignBlockSchema,
  handoverBlockSchema
]);

export const flowGraphSchema = z.object({
  startBlockId: z.string(),
  blocks: z.record(z.string(), flowBlockSchema)
});

export const saveDraftSchema = z.object({ graph: flowGraphSchema });
export type SaveDraftDto = z.infer<typeof saveDraftSchema>;

const keywordConfigSchema = z.object({
  keywords: z.array(z.string().min(1)).min(1),
  matchType: z.enum(KEYWORD_MATCH_TYPES)
});

const tagAddedConfigSchema = z.object({
  tagName: z.string().min(1).nullable()
});

// Custom trigger builder (docs/PRD.md Growth section): AND-ed extra
// conditions reusing the exact same field/operator shape routing rules
// already use, plus once-per-lead / delay limits.
const triggerConditionSchema = z.object({
  field: z.enum(ROUTING_CONDITION_FIELDS),
  operator: z.enum(ROUTING_CONDITION_OPERATORS),
  value: z.string().min(1),
  fieldId: z.string().optional()
});

const triggerLimitsSchema = z.object({
  onceForLead: z.boolean().optional(),
  delayMinutes: z.number().int().positive().optional()
});

const triggerTypeAndConfigSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("whatsapp_message_keyword"), config: keywordConfigSchema }),
  z.object({ type: z.literal("instagram_dm_keyword"), config: keywordConfigSchema }),
  z.object({ type: z.literal("tag_added"), config: tagAddedConfigSchema })
]);

export const setTriggerSchema = z.intersection(
  triggerTypeAndConfigSchema,
  z.object({
    conditions: z.array(triggerConditionSchema).optional(),
    limits: triggerLimitsSchema.optional()
  })
);
export type SetTriggerDto = z.infer<typeof setTriggerSchema>;

export const createSavedTriggerSchema = z.intersection(
  triggerTypeAndConfigSchema,
  z.object({
    name: z.string().min(1),
    conditions: z.array(triggerConditionSchema).optional(),
    limits: triggerLimitsSchema.optional()
  })
);
export type CreateSavedTriggerDto = z.infer<typeof createSavedTriggerSchema>;

export const testRunSchema = z.object({
  channel: z.enum(["instagram", "whatsapp"]),
  sampleMessage: z.string().min(1)
});
export type TestRunDto = z.infer<typeof testRunSchema>;
