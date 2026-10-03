import { z } from "zod";
import { LINK_IN_BIO_SLUG_PATTERN } from "@zenora/shared";

export const upsertLinkInBioSchema = z.object({
  slug: z.string().regex(LINK_IN_BIO_SLUG_PATTERN, "Use 3-40 lowercase letters, digits or hyphens"),
  title: z.string().min(1).max(80),
  bio: z.string().max(300).nullable().optional(),
  whatsappPhone: z.string().nullable().optional(),
  brochureUrl: z.string().url().startsWith("https://", "Brochure link must be https").nullable().optional(),
  published: z.boolean()
});
export type UpsertLinkInBioDto = z.infer<typeof upsertLinkInBioSchema>;

// consent must be literally true — the form's tick box, never defaulted.
export const callbackRequestSchema = z.object({
  name: z.string().trim().min(1).max(100),
  phone: z.string().min(1).max(30),
  consent: z.literal(true)
});
export type CallbackRequestDto = z.infer<typeof callbackRequestSchema>;
