import { describe, expect, it, vi } from "vitest";
import type { AuditService } from "../audit/audit.service";
import type { UsageService } from "../billing/usage.service";
import { updateStageSchema, createStageSchema } from "../pipelines/dto/pipelines.dto";
import type { PrismaService } from "../prisma/prisma.service";
import type { Mailer } from "../mail/mailer.service";
import type { ReferralsService } from "../referrals/referrals.service";
import { updateWorkspaceSettingsSchema } from "./dto/workspaces.dto";
import { WorkspacesService } from "./workspaces.service";

describe("what counts as qualified: settings", () => {
  it("accepts a minimum score of 1-1000, or null to turn the score rule off", () => {
    expect(updateWorkspaceSettingsSchema.safeParse({ qualifiedMinScore: 60 }).success).toBe(true);
    expect(updateWorkspaceSettingsSchema.safeParse({ qualifiedMinScore: null }).success).toBe(true);
    expect(updateWorkspaceSettingsSchema.safeParse({ qualifiedMinScore: 0 }).success).toBe(false);
    expect(updateWorkspaceSettingsSchema.safeParse({ qualifiedMinScore: 5000 }).success).toBe(false);
    expect(updateWorkspaceSettingsSchema.safeParse({ qualifiedMinScore: 12.5 }).success).toBe(false);
  });

  it("stores it on the workspace, and leaves it alone when the request does not mention it", async () => {
    const update = vi.fn().mockResolvedValue({ id: "ws1" });
    const client = { workspace: { findUnique: vi.fn().mockResolvedValue({ id: "ws1", labels: {} }), update } };
    const service = new WorkspacesService({ client } as unknown as PrismaService, { log: vi.fn() } as unknown as AuditService, {} as UsageService, {} as ReferralsService, {} as Mailer);

    await service.updateSettings("ws1", "u1", { qualifiedMinScore: 60 });
    expect(update.mock.calls[0]![0].data.qualifiedMinScore).toBe(60);
    await service.updateSettings("ws1", "u1", { qualifiedMinScore: null });
    expect(update.mock.calls[1]![0].data.qualifiedMinScore).toBeNull();
    await service.updateSettings("ws1", "u1", { name: "Renamed" });
    expect(update.mock.calls[2]![0].data.qualifiedMinScore).toBeUndefined(); // untouched
  });

  it("lets a stage be marked as counting as qualified, when created or later", () => {
    expect(createStageSchema.parse({ name: "Proposal sent", countsAsQualified: true }).countsAsQualified).toBe(true);
    expect(updateStageSchema.parse({ countsAsQualified: false }).countsAsQualified).toBe(false);
    expect(updateStageSchema.safeParse({ countsAsQualified: "yes" }).success).toBe(false);
  });
});
