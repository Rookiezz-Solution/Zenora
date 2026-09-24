import { z } from "zod";

export const CUSTOM_FIELD_TYPES = ["text", "number", "date", "select", "multiselect", "boolean"] as const;

export const createCustomFieldSchema = z.object({
  key: z
    .string()
    .min(1)
    .regex(/^[a-z][a-z0-9_]*$/, "key must be lowercase snake_case (e.g. budget_range)"),
  label: z.string().min(1),
  type: z.enum(CUSTOM_FIELD_TYPES),
  options: z.array(z.string()).optional(),
  required: z.boolean().default(false)
});
export type CreateCustomFieldDto = z.infer<typeof createCustomFieldSchema>;

export const updateCustomFieldSchema = z.object({
  label: z.string().min(1).optional(),
  options: z.array(z.string()).optional(),
  required: z.boolean().optional()
});
export type UpdateCustomFieldDto = z.infer<typeof updateCustomFieldSchema>;
