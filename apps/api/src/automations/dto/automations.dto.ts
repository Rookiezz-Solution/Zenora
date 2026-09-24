import { z } from "zod";
import { CONDITION_FIELDS, CONDITION_OPERATORS, KEYWORD_MATCH_TYPES, TRIGGER_TYPES } from "@zenora/shared";

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

export const setTriggerSchema = z.object({
  type: z.enum(TRIGGER_TYPES),
  config: z.object({
    keywords: z.array(z.string().min(1)).min(1),
    matchType: z.enum(KEYWORD_MATCH_TYPES)
  })
});
export type SetTriggerDto = z.infer<typeof setTriggerSchema>;

export const testRunSchema = z.object({
  channel: z.enum(["instagram", "whatsapp"]),
  sampleMessage: z.string().min(1)
});
export type TestRunDto = z.infer<typeof testRunSchema>;
