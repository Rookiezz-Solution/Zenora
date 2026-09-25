import { z } from "zod";

const audienceFilterSchema = z.object({
  tag: z.string().optional(),
  optedInOnly: z.boolean().default(true),
  skipRecentlyMessagedHours: z.number().int().positive().optional()
});
export type AudienceFilter = z.infer<typeof audienceFilterSchema>;

export const estimateAudienceSchema = z.object({ audienceFilter: audienceFilterSchema });
export type EstimateAudienceDto = z.infer<typeof estimateAudienceSchema>;

export const createBroadcastSchema = z.object({
  templateId: z.string().min(1),
  audienceFilter: audienceFilterSchema,
  scheduledAt: z.string().datetime().optional()
});
export type CreateBroadcastDto = z.infer<typeof createBroadcastSchema>;

export const sendTestSchema = z.object({ leadId: z.string().min(1) });
export type SendTestDto = z.infer<typeof sendTestSchema>;
