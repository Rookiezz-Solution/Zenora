import { ForbiddenException, type ExecutionContext } from "@nestjs/common";
import type { Reflector } from "@nestjs/core";
import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../../prisma/prisma.service";
import { PermissionsGuard } from "./permissions.guard";

function makeContext(params: Record<string, string>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ userId: params.userId, params })
    }),
    getHandler: () => () => undefined
  } as unknown as ExecutionContext;
}

function makeReflector(permission: string | undefined): Reflector {
  return { get: () => permission } as unknown as Reflector;
}

function makePrisma(membership: { role: string } | null) {
  const findUnique = vi.fn().mockResolvedValue(membership);
  const prisma = { client: { membership: { findUnique } } } as unknown as PrismaService;
  return { prisma, findUnique };
}

describe("PermissionsGuard", () => {
  it("allows the request through when the handler requires no permission", async () => {
    const reflector = makeReflector(undefined);
    const { prisma, findUnique } = makePrisma(null);
    const guard = new PermissionsGuard(reflector, prisma);

    await expect(guard.canActivate(makeContext({ workspaceId: "w1", userId: "u1" }))).resolves.toBe(true);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("allows a member whose role has the required permission", async () => {
    const reflector = makeReflector("leads.write");
    const { prisma } = makePrisma({ role: "sales" });
    const guard = new PermissionsGuard(reflector, prisma);

    await expect(guard.canActivate(makeContext({ workspaceId: "w1", userId: "u1" }))).resolves.toBe(true);
  });

  it("rejects a member whose role lacks the required permission", async () => {
    const reflector = makeReflector("billing.manage");
    const { prisma } = makePrisma({ role: "sales" });
    const guard = new PermissionsGuard(reflector, prisma);

    await expect(guard.canActivate(makeContext({ workspaceId: "w1", userId: "u1" }))).rejects.toBeInstanceOf(
      ForbiddenException
    );
  });

  it("rejects a caller with no membership in the workspace", async () => {
    const reflector = makeReflector("leads.read");
    const { prisma } = makePrisma(null);
    const guard = new PermissionsGuard(reflector, prisma);

    await expect(guard.canActivate(makeContext({ workspaceId: "w1", userId: "u1" }))).rejects.toBeInstanceOf(
      ForbiddenException
    );
  });

  it("rejects when the route has no workspaceId to scope the check to", async () => {
    const reflector = makeReflector("leads.read");
    const { prisma } = makePrisma(null);
    const guard = new PermissionsGuard(reflector, prisma);

    await expect(guard.canActivate(makeContext({ userId: "u1" }))).rejects.toBeInstanceOf(ForbiddenException);
  });
});
