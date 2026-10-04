import { BadRequestException } from "@nestjs/common";
import type { PrismaService } from "../prisma/prisma.service";

// Request bodies often name other records by id (an assignee, a lead, a team).
// An id is not proof the caller may use it: without a check, someone could point
// a task at another workspace's lead and read its name and phone back in their
// own task list, or assign work to a person who isn't in their workspace. These
// confirm the record belongs to the workspace in the URL.

export async function assertMember(prisma: PrismaService, workspaceId: string, userId: string | null | undefined): Promise<void> {
  if (!userId) return; // null means "unassign"
  const member = await prisma.client.membership.findUnique({ where: { workspaceId_userId: { workspaceId, userId } }, select: { id: true } });
  if (!member) throw new BadRequestException("That person is not a member of this workspace");
}

export async function assertLeadInWorkspace(prisma: PrismaService, workspaceId: string, leadId: string | null | undefined): Promise<void> {
  if (!leadId) return;
  const lead = await prisma.client.lead.findFirst({ where: { id: leadId, workspaceId }, select: { id: true } });
  if (!lead) throw new BadRequestException("That contact was not found in this workspace");
}

export async function assertTeamInWorkspace(prisma: PrismaService, workspaceId: string, teamId: string | null | undefined): Promise<void> {
  if (!teamId) return;
  const team = await prisma.client.team.findFirst({ where: { id: teamId, workspaceId }, select: { id: true } });
  if (!team) throw new BadRequestException("That team was not found in this workspace");
}
