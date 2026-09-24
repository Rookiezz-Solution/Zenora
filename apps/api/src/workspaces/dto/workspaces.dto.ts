import { z } from "zod";
import { WORKSPACE_ROLES } from "@zenora/shared";

export const createWorkspaceSchema = z.object({
  name: z.string().min(1),
  mode: z.enum(["team", "creator"]).default("team"),
  industry: z.string().optional()
});
export type CreateWorkspaceDto = z.infer<typeof createWorkspaceSchema>;

export const inviteMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum(WORKSPACE_ROLES).default("sales"),
  teamId: z.string().optional()
});
export type InviteMemberDto = z.infer<typeof inviteMemberSchema>;

export const updateMemberRoleSchema = z.object({
  role: z.enum(WORKSPACE_ROLES)
});
export type UpdateMemberRoleDto = z.infer<typeof updateMemberRoleSchema>;
