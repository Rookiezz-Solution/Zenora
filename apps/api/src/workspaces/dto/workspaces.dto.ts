import { z } from "zod";
import { WORKSPACE_ROLES } from "@zenora/shared";

export const createWorkspaceSchema = z.object({
  name: z.string().min(1),
  mode: z.enum(["team", "creator"]).default("team"),
  industry: z.string().optional(),
  // A referral code captured from a referral link; silently ignored if it is not valid.
  ref: z.string().max(20).optional()
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

export const updateMemberAvailabilitySchema = z.object({
  available: z.boolean()
});
export type UpdateMemberAvailabilityDto = z.infer<typeof updateMemberAvailabilitySchema>;

export const updateWorkspaceSettingsSchema = z.object({
  name: z.string().min(1).optional(),
  currency: z.string().length(3).optional(),
  timezone: z.string().min(1).optional(),
  // Speed rule (docs/PRD.md section 10): respond within N minutes else
  // reassign — read by the routing engine when it starts an SLA timer.
  slaMinutes: z.number().int().positive().optional(),
  // A lead whose score reaches this counts as "qualified" in the ads report; null turns the score rule off.
  qualifiedMinScore: z.number().int().min(1).max(1000).nullable().optional(),
  // Partial merge into Workspace.labels — e.g. { lead: "Student" } renames
  // only the "lead" term (docs/PRD.md: rename Lead/Appointment/Salesperson/
  // Won/Pipeline/Interest).
  labels: z.record(z.string(), z.string()).optional()
});
export type UpdateWorkspaceSettingsDto = z.infer<typeof updateWorkspaceSettingsSchema>;
