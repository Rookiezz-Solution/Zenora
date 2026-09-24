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

export const updateWorkspaceSettingsSchema = z.object({
  name: z.string().min(1).optional(),
  currency: z.string().length(3).optional(),
  timezone: z.string().min(1).optional(),
  // Partial merge into Workspace.labels — e.g. { lead: "Student" } renames
  // only the "lead" term (docs/PRD.md: rename Lead/Appointment/Salesperson/
  // Won/Pipeline/Interest).
  labels: z.record(z.string(), z.string()).optional()
});
export type UpdateWorkspaceSettingsDto = z.infer<typeof updateWorkspaceSettingsSchema>;
