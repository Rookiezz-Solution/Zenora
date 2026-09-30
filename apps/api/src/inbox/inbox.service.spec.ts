import { BadRequestException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { AiClient } from "../ai/ai.client";
import type { UsageService } from "../billing/usage.service";
import type { MetaGraphClient } from "../channels/meta-graph.client";
import type { PrismaService } from "../prisma/prisma.service";
import type { RealtimeService } from "../realtime/realtime.service";
import { InboxService } from "./inbox.service";

function makeClient(overrides: Record<string, unknown> = {}) {
  return {
    conversation: { findFirst: vi.fn().mockResolvedValue({ id: "conv1", workspaceId: "ws1" }) },
    message: {
      findMany: vi.fn().mockResolvedValue([
        { direction: "outbound", body: "How can I help?" },
        { direction: "inbound", body: "What's your pricing?" }
      ])
    },
    ...overrides
  };
}

function makeUsage(overrides: Partial<Record<keyof UsageService, unknown>> = {}) {
  return {
    checkAiCredits: vi.fn().mockResolvedValue({ allowed: true, remaining: 49, limit: 50 }),
    debitAiReplyCredit: vi.fn().mockResolvedValue({ allowed: true, remaining: 48 }),
    ...overrides
  } as unknown as UsageService;
}

function makeAi(overrides: Partial<Record<keyof AiClient, unknown>> = {}) {
  return { suggestReply: vi.fn().mockResolvedValue("Our pro plan is ₹8,999/month — want a quick call to walk through it?"), ...overrides } as unknown as AiClient;
}

function makeService(client: ReturnType<typeof makeClient>, ai = makeAi(), usage = makeUsage()) {
  return {
    service: new InboxService({ client } as unknown as PrismaService, {} as unknown as MetaGraphClient, { publish: vi.fn() } as unknown as RealtimeService, ai, usage),
    ai,
    usage
  };
}

describe("InboxService.suggestReply", () => {
  it("throws when the conversation doesn't exist in this workspace", async () => {
    const client = makeClient({ conversation: { findFirst: vi.fn().mockResolvedValue(null) } });
    const { service } = makeService(client);

    await expect(service.suggestReply("ws1", "missing")).rejects.toThrow(NotFoundException);
  });

  it("throws when there are no messages yet", async () => {
    const client = makeClient({ message: { findMany: vi.fn().mockResolvedValue([]) } });
    const { service } = makeService(client);

    await expect(service.suggestReply("ws1", "conv1")).rejects.toThrow("No messages yet to suggest a reply from");
  });

  it("throws when AI credits are exhausted, without calling the AI", async () => {
    const client = makeClient();
    const usage = makeUsage({ checkAiCredits: vi.fn().mockResolvedValue({ allowed: false, remaining: 0, limit: 50 }) });
    const ai = makeAi();
    const { service } = makeService(client, ai, usage);

    await expect(service.suggestReply("ws1", "conv1")).rejects.toThrow(BadRequestException);
    expect(ai.suggestReply).not.toHaveBeenCalled();
  });

  it("sends the chronologically-ordered transcript to the AI and debits one credit", async () => {
    const client = makeClient();
    const { service, ai, usage } = makeService(client);

    const result = await service.suggestReply("ws1", "conv1");

    expect(ai.suggestReply).toHaveBeenCalledWith([
      { direction: "inbound", body: "What's your pricing?" },
      { direction: "outbound", body: "How can I help?" }
    ]);
    expect(usage.debitAiReplyCredit).toHaveBeenCalledWith("ws1");
    expect(result).toEqual({ suggestion: "Our pro plan is ₹8,999/month — want a quick call to walk through it?", creditsRemaining: 48 });
  });
});
