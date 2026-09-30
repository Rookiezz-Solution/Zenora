import { z } from "zod";

const KNOWLEDGE_SOURCE_TYPES = ["text", "pdf", "sheet", "website"] as const;

// pdf/sheet paste extracted text for v1 (no file upload/parsing yet — see
// docs/PROGRESS.md Phase 2 item 1 simplification); website fetches sourceUrl
// server-side instead.
export const createKnowledgeSourceSchema = z
  .object({
    type: z.enum(KNOWLEDGE_SOURCE_TYPES),
    name: z.string().min(1),
    content: z.string().min(1).optional(),
    sourceUrl: z.string().url().optional()
  })
  .refine((v) => (v.type === "website" ? !!v.sourceUrl : !!v.content), {
    message: "content is required for text/pdf/sheet sources, sourceUrl is required for website sources"
  });
export type CreateKnowledgeSourceDto = z.infer<typeof createKnowledgeSourceSchema>;

export const updateKnowledgeSourceSchema = z.object({
  name: z.string().min(1).optional(),
  content: z.string().min(1).optional(),
  sourceUrl: z.string().url().optional()
});
export type UpdateKnowledgeSourceDto = z.infer<typeof updateKnowledgeSourceSchema>;

export const createFaqSchema = z.object({
  question: z.string().min(1),
  answer: z.string().min(1),
  sourceId: z.string().optional()
});
export type CreateFaqDto = z.infer<typeof createFaqSchema>;

export const updateFaqSchema = createFaqSchema.partial();
export type UpdateFaqDto = z.infer<typeof updateFaqSchema>;

export const generateFaqsSchema = z.object({
  sourceId: z.string()
});
export type GenerateFaqsDto = z.infer<typeof generateFaqsSchema>;

export const updateAiSettingsSchema = z.object({
  tone: z.string().min(1).optional(),
  languages: z.array(z.string()).min(1).optional(),
  answerOnlyFromSources: z.boolean().optional(),
  handoverWhenUnsure: z.boolean().optional(),
  handoverOnDiscountAsked: z.boolean().optional(),
  alwaysEndWithNextStep: z.boolean().optional(),
  replyInLeadsLanguage: z.boolean().optional(),
  sharePricesToggle: z.boolean().optional()
});
export type UpdateAiSettingsDto = z.infer<typeof updateAiSettingsSchema>;

export const testChatSchema = z.object({
  question: z.string().min(1)
});
export type TestChatDto = z.infer<typeof testChatSchema>;
