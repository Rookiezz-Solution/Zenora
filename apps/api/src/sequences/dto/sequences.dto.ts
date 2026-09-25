import { z } from "zod";

// Literals mirror @zenora/shared's SEQUENCE_ACTION_TYPES — a discriminated
// union needs them spelled out rather than built from the const array.
const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("send_text"), body: z.string().min(1) }),
  z.object({ type: z.literal("tag"), tagName: z.string().min(1) }),
  z.object({ type: z.literal("create_task"), title: z.string().min(1) })
]);

const stepSchema = z.object({
  waitHours: z.number().int().min(0),
  action: actionSchema
});

export const createSequenceSchema = z.object({
  name: z.string().min(1),
  steps: z.array(stepSchema).min(1)
});
export type CreateSequenceDto = z.infer<typeof createSequenceSchema>;

export const updateSequenceSchema = createSequenceSchema.partial();
export type UpdateSequenceDto = z.infer<typeof updateSequenceSchema>;

export const enrollLeadsSchema = z.object({
  leadIds: z.array(z.string()).min(1)
});
export type EnrollLeadsDto = z.infer<typeof enrollLeadsSchema>;
