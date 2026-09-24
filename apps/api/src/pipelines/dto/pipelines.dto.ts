import { z } from "zod";

export const createPipelineSchema = z.object({
  name: z.string().min(1),
  isDefault: z.boolean().default(false)
});
export type CreatePipelineDto = z.infer<typeof createPipelineSchema>;

export const updatePipelineSchema = z.object({
  name: z.string().min(1).optional(),
  isDefault: z.boolean().optional()
});
export type UpdatePipelineDto = z.infer<typeof updatePipelineSchema>;

const stageType = z.enum(["open", "won", "lost"]);

export const createStageSchema = z.object({
  name: z.string().min(1),
  type: stageType.default("open"),
  requiredFieldIds: z.array(z.string()).default([]),
  slaMinutes: z.number().int().positive().optional()
});
export type CreateStageDto = z.infer<typeof createStageSchema>;

export const updateStageSchema = z.object({
  name: z.string().min(1).optional(),
  type: stageType.optional(),
  requiredFieldIds: z.array(z.string()).optional(),
  slaMinutes: z.number().int().positive().nullable().optional()
});
export type UpdateStageDto = z.infer<typeof updateStageSchema>;

export const reorderStagesSchema = z.object({
  stageIds: z.array(z.string()).min(1)
});
export type ReorderStagesDto = z.infer<typeof reorderStagesSchema>;
