import { BadRequestException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../prisma/prisma.service";
import { assertLeadInWorkspace, assertMember, assertTeamInWorkspace } from "./workspace-refs";

const prismaWith = (found: Record<string, unknown>) =>
  ({
    client: {
      membership: { findUnique: vi.fn().mockResolvedValue(found.membership ?? null) },
      lead: { findFirst: vi.fn().mockResolvedValue(found.lead ?? null) },
      team: { findFirst: vi.fn().mockResolvedValue(found.team ?? null) }
    }
  }) as unknown as PrismaService & { client: Record<string, { [m: string]: ReturnType<typeof vi.fn> }> };

describe("workspace reference checks", () => {
  it("accepts a member of this workspace, and treats an empty value as 'none'", async () => {
    const prisma = prismaWith({ membership: { id: "m1" } });
    await expect(assertMember(prisma, "ws1", "u1")).resolves.toBeUndefined();
    expect(prisma.client.membership!.findUnique).toHaveBeenCalledWith({ where: { workspaceId_userId: { workspaceId: "ws1", userId: "u1" } }, select: { id: true } });
    await expect(assertMember(prisma, "ws1", null)).resolves.toBeUndefined();
    await expect(assertMember(prisma, "ws1", undefined)).resolves.toBeUndefined();
  });

  it("refuses someone who is not a member of this workspace", async () => {
    await expect(assertMember(prismaWith({}), "ws1", "stranger")).rejects.toBeInstanceOf(BadRequestException);
  });

  it("only accepts a lead that belongs to this workspace", async () => {
    const ok = prismaWith({ lead: { id: "l1" } });
    await expect(assertLeadInWorkspace(ok, "ws1", "l1")).resolves.toBeUndefined();
    expect(ok.client.lead!.findFirst).toHaveBeenCalledWith({ where: { id: "l1", workspaceId: "ws1" }, select: { id: true } });
    await expect(assertLeadInWorkspace(prismaWith({}), "ws1", "someone-elses-lead")).rejects.toBeInstanceOf(BadRequestException);
  });

  it("only accepts a team that belongs to this workspace", async () => {
    await expect(assertTeamInWorkspace(prismaWith({ team: { id: "t1" } }), "ws1", "t1")).resolves.toBeUndefined();
    await expect(assertTeamInWorkspace(prismaWith({}), "ws1", "other-team")).rejects.toBeInstanceOf(BadRequestException);
  });
});
