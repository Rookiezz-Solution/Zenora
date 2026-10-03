import { API_KEY_SCOPES, WEBHOOK_EVENTS } from "@zenora/shared";
import { z } from "zod";

export const createApiKeySchema = z.object({
  name: z.string().trim().min(1).max(60),
  scopes: z.array(z.enum(API_KEY_SCOPES)).min(1)
});
export type CreateApiKeyDto = z.infer<typeof createApiKeySchema>;

const events = z.array(z.enum(WEBHOOK_EVENTS)).min(1);

export const createWebhookSchema = z.object({
  url: z.string().trim().min(1).max(2000),
  description: z.string().trim().max(120).optional(),
  events
});
export type CreateWebhookDto = z.infer<typeof createWebhookSchema>;

export const updateWebhookSchema = z.object({
  url: z.string().trim().min(1).max(2000).optional(),
  description: z.string().trim().max(120).nullable().optional(),
  events: events.optional(),
  active: z.boolean().optional()
});
export type UpdateWebhookDto = z.infer<typeof updateWebhookSchema>;

const blankToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

export const publicCreateLeadSchema = z
  .object({
    name: z.preprocess(blankToUndefined, z.string().trim().max(120).optional()),
    phone: z.preprocess(blankToUndefined, z.string().max(30).optional()),
    email: z.preprocess(blankToUndefined, z.string().email().max(200).optional()),
    source: z.preprocess(blankToUndefined, z.string().trim().max(40).optional())
  })
  .refine((v) => v.phone || v.email, { message: "Provide a phone or an email" });
export type PublicCreateLeadDto = z.infer<typeof publicCreateLeadSchema>;

export const publicListLeadsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().min(1).optional(),
  phone: z.string().max(30).optional(),
  email: z.string().max(200).optional()
});
export type PublicListLeadsQuery = z.infer<typeof publicListLeadsSchema>;
