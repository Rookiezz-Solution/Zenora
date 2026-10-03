import { z } from "zod";

export const createAgencySchema = z.object({ name: z.string().trim().min(2).max(80) });
export type CreateAgencyDto = z.infer<typeof createAgencySchema>;

export const createClientSchema = z.object({
  name: z.string().trim().min(1).max(80),
  mode: z.enum(["team", "creator"]).default("team"),
  industry: z.string().trim().max(60).optional()
});
export type CreateClientDto = z.infer<typeof createClientSchema>;

export const linkClientSchema = z.object({ workspaceId: z.string().min(1) });
export type LinkClientDto = z.infer<typeof linkClientSchema>;

export const addAgencyMemberSchema = z.object({ email: z.string().trim().toLowerCase().email() });
export type AddAgencyMemberDto = z.infer<typeof addAgencyMemberSchema>;
