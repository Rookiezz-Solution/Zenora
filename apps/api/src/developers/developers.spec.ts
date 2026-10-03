import { BadRequestException, ConflictException, ForbiddenException, NotFoundException, UnauthorizedException } from "@nestjs/common";
import type { ExecutionContext } from "@nestjs/common";
import type { Reflector } from "@nestjs/core";
import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../prisma/prisma.service";
import type { QueueService } from "../queue/queue.service";
import type { RoutingEngineService } from "../routing/routing-engine.service";
import { ApiKeyGuard } from "./api-key.guard";
import { ApiKeysService, hashApiKey } from "./api-keys.service";
import { PublicApiService } from "./public-api.service";
import { WebhooksService } from "./webhooks.service";

vi.mock("../common/encryption", () => ({ encryptToken: (v: string) => `enc(${v})`, decryptToken: (v: string) => v }));
vi.mock("../config/env", () => ({ loadEnv: () => ({ WEBHOOK_ALLOW_PRIVATE: undefined }) }));

const prismaOf = (client: Record<string, unknown>) => ({ client }) as unknown as PrismaService;

describe("ApiKeysService", () => {
  it("returns the full key once, stores only its hash, and never the key itself", async () => {
    const create = vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: "k1", name: data.name, prefix: data.prefix, scopes: data.scopes, createdAt: new Date() }));
    const service = new ApiKeysService(prismaOf({ apiKey: { create } }));

    const result = await service.create("ws1", "u1", { name: "Zapier", scopes: ["leads:read"] });

    expect(result.key).toMatch(/^znr_live_[A-Za-z0-9_-]{32}$/);
    const stored = create.mock.calls[0]![0].data;
    expect(stored.keyHash).toBe(hashApiKey(result.key));
    expect(JSON.stringify(stored)).not.toContain(result.key);
    expect(stored.prefix).toBe(result.key.slice(0, 13));
  });

  it("never selects the hash when listing", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    await new ApiKeysService(prismaOf({ apiKey: { findMany } })).list("ws1");
    expect(findMany.mock.calls[0]![0].select).not.toHaveProperty("keyHash");
  });

  it("authenticates a live key, and rejects revoked, unknown and wrongly-prefixed ones", async () => {
    const findUnique = vi.fn().mockResolvedValue({ id: "k1", workspaceId: "ws1", scopes: ["leads:read"], revokedAt: null, lastUsedAt: new Date() });
    const service = new ApiKeysService(prismaOf({ apiKey: { findUnique, update: vi.fn().mockResolvedValue({}) } }));

    await expect(service.authenticate("znr_live_abc")).resolves.toEqual({ id: "k1", workspaceId: "ws1", scopes: ["leads:read"] });
    expect(findUnique).toHaveBeenCalledWith({ where: { keyHash: hashApiKey("znr_live_abc") } });

    findUnique.mockResolvedValueOnce({ id: "k1", workspaceId: "ws1", scopes: [], revokedAt: new Date(), lastUsedAt: null });
    await expect(service.authenticate("znr_live_abc")).resolves.toBeNull();
    findUnique.mockResolvedValueOnce(null);
    await expect(service.authenticate("znr_live_nope")).resolves.toBeNull();
    await expect(service.authenticate("sk_other_key")).resolves.toBeNull();
  });

  it("only revokes keys in the caller's workspace", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });
    await expect(new ApiKeysService(prismaOf({ apiKey: { updateMany } })).revoke("ws1", "k9")).rejects.toThrow(NotFoundException);
    expect(updateMany.mock.calls[0]![0].where).toEqual({ id: "k9", workspaceId: "ws1", revokedAt: null });
  });
});

describe("ApiKeyGuard", () => {
  function run(header: string | undefined, key: unknown, requiredScope?: string) {
    const keys = { authenticate: vi.fn().mockResolvedValue(key) } as unknown as ApiKeysService;
    const reflector = { get: () => requiredScope } as unknown as Reflector;
    const req: Record<string, unknown> = { headers: header ? { authorization: header } : {} };
    const ctx = { switchToHttp: () => ({ getRequest: () => req }), getHandler: () => undefined } as unknown as ExecutionContext;
    return { result: new ApiKeyGuard(keys, reflector).canActivate(ctx), req, keys };
  }

  it("rejects a missing or malformed Authorization header without hitting the database", async () => {
    const a = run(undefined, null);
    await expect(a.result).rejects.toThrow(UnauthorizedException);
    expect(a.keys.authenticate).not.toHaveBeenCalled();
    await expect(run("Basic abc", null).result).rejects.toThrow(UnauthorizedException);
  });

  it("rejects an unknown key", async () => {
    await expect(run("Bearer znr_live_x", null).result).rejects.toThrow(UnauthorizedException);
  });

  it("attaches the workspace from the key, and enforces scopes", async () => {
    const key = { id: "k1", workspaceId: "ws1", scopes: ["leads:read"] };
    const ok = run("Bearer znr_live_x", key, "leads:read");
    await expect(ok.result).resolves.toBe(true);
    expect(ok.req.apiKey).toEqual(key);

    await expect(run("Bearer znr_live_x", key, "leads:write").result).rejects.toThrow(ForbiddenException);
  });

  it("rate-limits a single key", async () => {
    const guard = new ApiKeyGuard({ authenticate: vi.fn().mockResolvedValue({ id: "k1", workspaceId: "ws1", scopes: [] }) } as unknown as ApiKeysService, { get: () => undefined } as unknown as Reflector);
    const ctx = { switchToHttp: () => ({ getRequest: () => ({ headers: { authorization: "Bearer znr_live_x" } }) }), getHandler: () => undefined } as unknown as ExecutionContext;
    for (let i = 0; i < 120; i++) await guard.canActivate(ctx);
    await expect(guard.canActivate(ctx)).rejects.toThrow("Too many requests");
  });
});

describe("WebhooksService", () => {
  const make = (client: Record<string, unknown> = {}) => {
    const queue = { add: vi.fn().mockResolvedValue({}) };
    const full = {
      webhookEndpoint: { create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: "w1", url: data.url, events: data.events, active: true })), findMany: vi.fn().mockResolvedValue([]), updateMany: vi.fn(), deleteMany: vi.fn(), findFirst: vi.fn() },
      webhookDelivery: { create: vi.fn().mockResolvedValue({}), findMany: vi.fn().mockResolvedValue([]) },
      lead: { findUnique: vi.fn() },
      ...client
    };
    return { service: new WebhooksService(prismaOf(full), queue as unknown as QueueService), queue, client: full };
  };

  it("creates an endpoint, returning the signing secret once and storing it encrypted", async () => {
    const { service, client } = make();
    const result = await service.create("ws1", { url: "https://hooks.example.com/z", events: ["lead.created"] });

    expect(result.secret).toMatch(/^whsec_/);
    const stored = (client.webhookEndpoint.create as ReturnType<typeof vi.fn>).mock.calls[0]![0].data;
    expect(stored.secretCipher).toBe(`enc(${result.secret})`);
    expect(JSON.stringify((client.webhookEndpoint.create as ReturnType<typeof vi.fn>).mock.calls[0]![0].select)).not.toContain("secret");
  });

  it("refuses private, internal and plain-http targets", async () => {
    const { service } = make();
    for (const url of ["http://example.com/x", "https://169.254.169.254/latest", "https://localhost/hook", "https://10.0.0.5/hook", "nonsense"]) {
      await expect(service.create("ws1", { url, events: ["lead.created"] })).rejects.toThrow(BadRequestException);
    }
  });

  it("re-checks the URL when it is edited, and only edits endpoints in the caller's workspace", async () => {
    const { service } = make();
    await expect(service.update("ws1", "w1", { url: "https://127.0.0.1/x" })).rejects.toThrow(BadRequestException);

    const { service: s2 } = make({ webhookEndpoint: { updateMany: vi.fn().mockResolvedValue({ count: 0 }), deleteMany: vi.fn().mockResolvedValue({ count: 0 }), findFirst: vi.fn().mockResolvedValue(null) } });
    await expect(s2.update("ws1", "w1", { active: false })).rejects.toThrow(NotFoundException);
    await expect(s2.remove("ws1", "w1")).rejects.toThrow(NotFoundException);
    await expect(s2.deliveries("ws1", "w1")).rejects.toThrow(NotFoundException);
    await expect(s2.sendTest("ws1", "w1")).rejects.toThrow(NotFoundException);
  });

  it("emit fans out to active endpoints subscribed to the event, one queued delivery each", async () => {
    const { service, client, queue } = make({ webhookEndpoint: { findMany: vi.fn().mockResolvedValue([{ id: "w1" }, { id: "w2" }]) } });
    await service.emit("ws1", "lead.created", { id: "l1" });

    expect(client.webhookEndpoint.findMany).toHaveBeenCalledWith({ where: { workspaceId: "ws1", active: true, events: { has: "lead.created" } }, select: { id: true } });
    expect(client.webhookDelivery.create).toHaveBeenCalledTimes(2);
    const delivery = (client.webhookDelivery.create as ReturnType<typeof vi.fn>).mock.calls[0]![0].data;
    expect(delivery.payload).toMatchObject({ id: delivery.id, event: "lead.created", workspaceId: "ws1", data: { id: "l1" } });
    expect(queue.add).toHaveBeenCalledWith("webhooks", "deliver", { deliveryId: delivery.id });
  });

  it("emit never throws into the feature that triggered it", async () => {
    const { service } = make({ webhookEndpoint: { findMany: vi.fn().mockRejectedValue(new Error("db down")) } });
    await expect(service.emit("ws1", "lead.created", {})).resolves.toBeUndefined();
  });
});

describe("PublicApiService", () => {
  const lead = { id: "l1", name: "Asha", phone: "919000000001", email: null, source: "api", stageId: null, score: 0, createdAt: new Date(), updatedAt: new Date() };
  const make = (client: Record<string, unknown> = {}) => {
    const routing = { applyToNewLead: vi.fn() };
    const webhooks = { emit: vi.fn() };
    const full = { lead: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue(lead) }, ...client };
    return { service: new PublicApiService(prismaOf(full), routing as unknown as RoutingEngineService, webhooks as unknown as WebhooksService), routing, webhooks, client: full };
  };

  it("scopes every query to the key's workspace and pages with a cursor", async () => {
    const rows = [1, 2, 3].map((n) => ({ ...lead, id: `l${n}` }));
    const { service, client } = make({ lead: { findMany: vi.fn().mockResolvedValue(rows) } });
    const page = await service.listLeads("ws1", { limit: 2 });

    expect(page.data.map((l) => l.id)).toEqual(["l1", "l2"]);
    expect(page.nextCursor).toBe("l2");
    expect((client.lead.findMany as ReturnType<typeof vi.fn>).mock.calls[0]![0].where).toMatchObject({ workspaceId: "ws1", mergedIntoId: null });
  });

  it("a lead from another workspace is simply not found", async () => {
    const { service } = make();
    await expect(service.getLead("ws1", "someone-elses")).rejects.toThrow(NotFoundException);
  });

  it("creates a lead (source defaults to api), routes it and announces it", async () => {
    const { service, client, routing, webhooks } = make();
    await service.createLead("ws1", { name: "Asha", phone: "+91 90000 00001" });

    expect((client.lead.create as ReturnType<typeof vi.fn>).mock.calls[0]![0].data).toMatchObject({ workspaceId: "ws1", phone: "919000000001", source: "api" });
    expect(routing.applyToNewLead).toHaveBeenCalledWith("ws1", "l1");
    expect(webhooks.emit).toHaveBeenCalledWith("ws1", "lead.created", expect.objectContaining({ id: "l1" }));
  });

  it("returns 409 with the existing lead's id for a duplicate, and 400 for a bad phone", async () => {
    const dup = make({ lead: { findFirst: vi.fn().mockResolvedValue({ id: "old" }), create: vi.fn() } });
    await expect(dup.service.createLead("ws1", { phone: "919000000001" })).rejects.toThrow(ConflictException);
    expect(dup.client.lead.create).not.toHaveBeenCalled();
    await expect(make().service.createLead("ws1", { phone: "12" })).rejects.toThrow(BadRequestException);
  });
});
