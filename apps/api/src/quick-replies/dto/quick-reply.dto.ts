import { z } from "zod";

export const createQuickReplySchema = z.object({
  shortcut: z.string().min(1),
  body: z.string().min(1),
  mediaUrl: z.string().url().optional()
});
export type CreateQuickReplyDto = z.infer<typeof createQuickReplySchema>;

export const updateQuickReplySchema = createQuickReplySchema.partial();
export type UpdateQuickReplyDto = z.infer<typeof updateQuickReplySchema>;
