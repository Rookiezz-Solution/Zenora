import { z } from "zod";

// wabaId/phoneNumberId come from the WhatsApp Embedded Signup JS SDK's
// postMessage event, not from the OAuth `code` itself.
export const connectWhatsappSchema = z.object({
  code: z.string().min(1),
  wabaId: z.string().min(1),
  phoneNumberId: z.string().min(1)
});
export type ConnectWhatsappDto = z.infer<typeof connectWhatsappSchema>;
