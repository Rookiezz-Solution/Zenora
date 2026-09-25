import { z } from "zod";

const buttonSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("quick_reply"), text: z.string().min(1).max(25) }),
  z.object({ type: z.literal("url"), text: z.string().min(1).max(25), url: z.string().url() }),
  z.object({ type: z.literal("phone_number"), text: z.string().min(1).max(25), phoneNumber: z.string().min(1) })
]);

export const createWaTemplateSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(512)
    .regex(/^[a-z][a-z0-9_]*$/, "Meta requires lowercase snake_case (e.g. order_confirmation)"),
  category: z.enum(["marketing", "utility", "authentication"]),
  language: z.string().min(2).default("en"),
  headerType: z.enum(["none", "text", "image", "video", "document"]).default("none"),
  headerText: z.string().max(60).optional(),
  bodyText: z.string().min(1).max(1024),
  footerText: z.string().max(60).optional(),
  buttons: z.array(buttonSchema).max(10).default([])
});
export type CreateWaTemplateDto = z.infer<typeof createWaTemplateSchema>;

export const updateWaTemplateSchema = createWaTemplateSchema.partial().omit({ name: true });
export type UpdateWaTemplateDto = z.infer<typeof updateWaTemplateSchema>;

export const listWaTemplatesQuerySchema = z.object({
  scope: z.enum(["approved", "all"]).default("approved")
});
export type ListWaTemplatesQuery = z.infer<typeof listWaTemplatesQuerySchema>;
