import { z } from "zod";

export const listConversationsQuerySchema = z.object({
  filter: z.enum(["mine", "unassigned", "bot_active", "waiting_on_us"]).optional()
});
export type ListConversationsQuery = z.infer<typeof listConversationsQuerySchema>;

export const sendMessageSchema = z
  .object({
    body: z.string().min(1).optional(),
    templateId: z.string().optional()
  })
  .refine((d) => d.body || d.templateId, { message: "body or templateId is required" });
export type SendMessageDto = z.infer<typeof sendMessageSchema>;

export const handoverSchema = z.object({ active: z.boolean() });
export type HandoverDto = z.infer<typeof handoverSchema>;

export const assignConversationSchema = z.object({ userId: z.string().nullable() });
export type AssignConversationDto = z.infer<typeof assignConversationSchema>;
