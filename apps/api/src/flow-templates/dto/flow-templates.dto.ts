import { z } from "zod";
import { INDUSTRY_STARTER_KITS } from "@zenora/shared";
import { flowGraphSchema } from "../../automations/dto/automations.dto";

export const listFlowTemplatesQuerySchema = z.object({
  scope: z.enum(["all", "mine", "public"]).default("all"),
  industry: z.enum(INDUSTRY_STARTER_KITS).optional()
});
export type ListFlowTemplatesQuery = z.infer<typeof listFlowTemplatesQuerySchema>;

export const createFlowTemplateSchema = z.object({
  name: z.string().min(1),
  industry: z.enum(INDUSTRY_STARTER_KITS).optional(),
  graph: flowGraphSchema
});
export type CreateFlowTemplateDto = z.infer<typeof createFlowTemplateSchema>;

export const updateFlowTemplateSchema = z.object({
  name: z.string().min(1).optional(),
  industry: z.enum(INDUSTRY_STARTER_KITS).optional(),
  graph: flowGraphSchema.optional()
});
export type UpdateFlowTemplateDto = z.infer<typeof updateFlowTemplateSchema>;

export const useFlowTemplateSchema = z.object({
  name: z.string().min(1)
});
export type UseFlowTemplateDto = z.infer<typeof useFlowTemplateSchema>;

export const saveAsTemplateSchema = z.object({
  name: z.string().min(1),
  industry: z.enum(INDUSTRY_STARTER_KITS).optional()
});
export type SaveAsTemplateDto = z.infer<typeof saveAsTemplateSchema>;
