import { ForbiddenException, type ExecutionContext } from "@nestjs/common";
import type { Reflector } from "@nestjs/core";
import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../../prisma/prisma.service";
import { PermissionsGuard } from "./permissions.guard";

function makeContext(params: Record<string, string>): ExecutionContext {
  const handler = () => undefined;
  const klass = class {};
  return {
    switchToHttp: () => ({
      getRequest: () => ({ userId: params.userId, params })
    }),
    getHandler: () => handler,
    getClass: () => klass
  } as unknown as ExecutionContext;
}

function makeReflector(permission: string | undefined): Reflector {
  return { getAllAndOverride: () => permission } as unknown as Reflector;
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

  it("checks both the handler and the class when resolving the required permission", async () => {
    const getAllAndOverride = vi.fn().mockReturnValue("leads.read");
    const reflector = { getAllAndOverride } as unknown as Reflector;
    const { prisma } = makePrisma({ role: "viewer" });
    const guard = new PermissionsGuard(reflector, prisma);
    const context = makeContext({ workspaceId: "w1", userId: "u1" });

    await guard.canActivate(context);

    expect(getAllAndOverride).toHaveBeenCalledWith("permission", [context.getHandler(), context.getClass()]);
  });
});
