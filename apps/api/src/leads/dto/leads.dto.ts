import { z } from "zod";

// `.optional()` only skips validation for `undefined` — but a blank form
// field or an empty CSV cell arrives as `""`, which still hits `.email()`
// and fails. Treat blank strings as "not provided" everywhere an optional
// field is a string.
const blankToUndefined = (val: unknown) => (val === "" ? undefined : val);
const optionalString = () => z.preprocess(blankToUndefined, z.string().min(1).optional());
const optionalEmail = () => z.preprocess(blankToUndefined, z.string().email().optional());

export const listLeadsQuerySchema = z.object({
  search: z.string().optional(),
  tag: z.string().optional()
});
export type ListLeadsQuery = z.infer<typeof listLeadsQuerySchema>;

export const createLeadSchema = z.object({
  name: optionalString(),
  phone: optionalString(),
  email: optionalEmail(),
  source: z.string().default("manual")
});
export type CreateLeadDto = z.infer<typeof createLeadSchema>;

export const updateLeadSchema = z.object({
  name: optionalString(),
  phone: optionalString(),
  email: optionalEmail()
});
export type UpdateLeadDto = z.infer<typeof updateLeadSchema>;

export const addTagSchema = z.object({ name: z.string().min(1) });
export type AddTagDto = z.infer<typeof addTagSchema>;

export const addNoteSchema = z.object({ body: z.string().min(1) });
export type AddNoteDto = z.infer<typeof addNoteSchema>;

export const mergeLeadsSchema = z.object({
  primaryLeadId: z.string().min(1),
  duplicateLeadId: z.string().min(1)
});
export type MergeLeadsDto = z.infer<typeof mergeLeadsSchema>;

export const moveStageSchema = z.object({
  stageId: z.string().min(1),
  fieldValues: z.record(z.string(), z.unknown()).optional()
});
export type MoveStageDto = z.infer<typeof moveStageSchema>;

export const importLeadsSchema = z.object({
  dedupeStrategy: z.enum(["skip", "update"]).default("skip"),
  rows: z
    .array(
      z.object({
        name: optionalString(),
        phone: optionalString(),
        email: optionalEmail(),
        tags: z.array(z.string()).optional()
      })
    )
    .min(1)
    .max(5000)
});
export type ImportLeadsDto = z.infer<typeof importLeadsSchema>;
