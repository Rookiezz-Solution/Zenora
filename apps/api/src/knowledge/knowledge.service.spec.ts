import { BadRequestException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { AiClient } from "../ai/ai.client";
import type { UsageService } from "../billing/usage.service";
import type { PrismaService } from "../prisma/prisma.service";
import type { QueueService } from "../queue/queue.service";
import { KnowledgeService } from "./knowledge.service";

function makeClient(overrides: Record<string, unknown> = {}) {
  return {
    knowledgeSource: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      findUniqueOrThrow: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 })
    },
    knowledgeChunk: {
      findMany: vi.fn().mockResolvedValue([]),
      deleteMany: vi.fn(),
      create: vi.fn()
    },
    faq: {
      findMany: vi.fn().mockResolvedValue([]),
      findUniqueOrThrow: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 })
    },
    aiSettings: { findUnique: vi.fn().mockResolvedValue(null), upsert: vi.fn() },
    $transaction: vi.fn().mockImplementation((ops: Promise<unknown>[]) => Promise.all(ops)),
    ...overrides
  };
}

function makeAi(overrides: Partial<Record<keyof AiClient, unknown>> = {}) {
  return {
    answerFromKnowledge: vi.fn().mockResolvedValue({ answer: "Sure.", citedIndex: null, handover: false }),
    generateFaqsFromContent: vi.fn().mockResolvedValue([]),
    ...overrides
  } as unknown as AiClient;
}

function makeUsage(overrides: Partial<Record<keyof UsageService, unknown>> = {}) {
  return {
    checkAiCredits: vi.fn().mockResolvedValue({ allowed: true, remaining: 49, limit: 50 }),
    debitAiReplyCredit: vi.fn().mockResolvedValue({ allowed: true, remaining: 48 }),
    ...overrides
  } as unknown as UsageService;
}

function makeQueue(overrides: Partial<Record<keyof QueueService, unknown>> = {}) {
  return { add: vi.fn(), ...overrides } as unknown as QueueService;
}

function makeService(
  client: ReturnType<typeof makeClient>,
  ai = makeAi(),
  usage = makeUsage(),
  queue = makeQueue()
) {
  return { service: new KnowledgeService({ client } as unknown as PrismaService, ai, usage, queue), ai, usage, queue };
}

describe("KnowledgeService.createSource", () => {
  it("processes text sources synchronously and marks them ready", async () => {
    const client = makeClient({
      knowledgeSource: {
        create: vi.fn().mockResolvedValue({ id: "src1", type: "text", status: "ready" }),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        update: vi.fn(),
        deleteMany: vi.fn()
      }
    });
    const { service, queue } = makeService(client);

    const result = await service.createSource("ws1", { type: "text", name: "Refunds", content: "Returns within 7 days." });

    expect(result).toEqual({ id: "src1", type: "text", status: "ready" });
    expect(client.knowledgeSource.create).toHaveBeenCalledWith({
      data: { workspaceId: "ws1", type: "text", name: "Refunds", content: "Returns within 7 days.", status: "ready" }
    });
    expect(client.knowledgeChunk.deleteMany).toHaveBeenCalledWith({ where: { sourceId: "src1" } });
    expect(queue.add).not.toHaveBeenCalled();
  });

  it("queues website sources for async fetch and marks them pending", async () => {
    const client = makeClient({
      knowledgeSource: {
        create: vi.fn().mockResolvedValue({ id: "src2", type: "website", status: "pending" }),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        update: vi.fn(),
        deleteMany: vi.fn()
      }
    });
    const { service, queue } = makeService(client);

    const result = await service.createSource("ws1", { type: "website", name: "FAQ page", sourceUrl: "https://example.com/faq" });

    expect(result.status).toBe("pending");
    expect(client.knowledgeSource.create).toHaveBeenCalledWith({
      data: { workspaceId: "ws1", type: "website", name: "FAQ page", sourceUrl: "https://example.com/faq", status: "pending" }
    });
    expect(queue.add).toHaveBeenCalledWith("ai", "process_knowledge_source", { sourceId: "src2" });
  });
});

describe("KnowledgeService.updateSource", () => {
  it("throws when the source doesn't exist in this workspace", async () => {
    const client = makeClient();
    const { service } = makeService(client);

    await expect(service.updateSource("ws1", "missing", { name: "x" })).rejects.toThrow(NotFoundException);
  });

  it("re-queues a website source when its URL changes", async () => {
    const client = makeClient({
      knowledgeSource: {
        findFirst: vi.fn().mockResolvedValue({ id: "src1", type: "website", name: "Old" }),
        findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "src1", status: "pending" }),
        create: vi.fn(),
        update: vi.fn(),
        deleteMany: vi.fn(),
        findMany: vi.fn()
      }
    });
    const { service, queue } = makeService(client);

    await service.updateSource("ws1", "src1", { sourceUrl: "https://example.com/new" });

    expect(client.knowledgeSource.update).toHaveBeenCalledWith({
      where: { id: "src1" },
      data: { name: "Old", sourceUrl: "https://example.com/new", status: "pending", errorMessage: null }
    });
    expect(queue.add).toHaveBeenCalledWith("ai", "process_knowledge_source", { sourceId: "src1" });
  });

  it("rebuilds chunks synchronously when content changes on a text source", async () => {
    const client = makeClient({
      knowledgeSource: {
        findFirst: vi.fn().mockResolvedValue({ id: "src1", type: "text", name: "Refunds" }),
        findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "src1", status: "ready" }),
        create: vi.fn(),
        update: vi.fn(),
        deleteMany: vi.fn(),
        findMany: vi.fn()
      }
    });
    const { service } = makeService(client);

    await service.updateSource("ws1", "src1", { content: "New refund text." });

    expect(client.knowledgeSource.update).toHaveBeenCalledWith({
      where: { id: "src1" },
      data: { name: "Refunds", content: "New refund text.", status: "ready", errorMessage: null }
    });
    expect(client.knowledgeChunk.deleteMany).toHaveBeenCalledWith({ where: { sourceId: "src1" } });
  });
});

describe("KnowledgeService.removeSource", () => {
  it("throws when nothing was deleted", async () => {
    const client = makeClient({ knowledgeSource: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }), findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() } });
    const { service } = makeService(client);

    await expect(service.removeSource("ws1", "missing")).rejects.toThrow(NotFoundException);
  });
});

describe("KnowledgeService.generateFaqs", () => {
  it("throws when the source doesn't exist", async () => {
    const client = makeClient();
    const { service } = makeService(client);

    await expect(service.generateFaqs("ws1", { sourceId: "missing" })).rejects.toThrow(NotFoundException);
  });

  it("throws when the source has no extracted content yet", async () => {
    const client = makeClient({
      knowledgeSource: { findFirst: vi.fn().mockResolvedValue({ id: "src1", content: null }), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), deleteMany: vi.fn() }
    });
    const { service } = makeService(client);

    await expect(service.generateFaqs("ws1", { sourceId: "src1" })).rejects.toThrow(BadRequestException);
  });

  it("auto-saves generated FAQs against the source", async () => {
    const client = makeClient({
      knowledgeSource: { findFirst: vi.fn().mockResolvedValue({ id: "src1", content: "We ship in 3 days." }), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), deleteMany: vi.fn() },
      faq: { create: vi.fn().mockResolvedValue({ id: "faq1" }), findMany: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() }
    });
    const ai = makeAi({ generateFaqsFromContent: vi.fn().mockResolvedValue([{ question: "How fast is shipping?", answer: "3 days." }]) });
    const { service } = makeService(client, ai);

    const result = await service.generateFaqs("ws1", { sourceId: "src1" });

    expect(client.faq.create).toHaveBeenCalledWith({ data: { workspaceId: "ws1", question: "How fast is shipping?", answer: "3 days.", sourceId: "src1" } });
    expect(result).toEqual([{ id: "faq1" }]);
  });
});

describe("KnowledgeService.testChat", () => {
  it("hands over without calling the AI when credits are exhausted", async () => {
    const client = makeClient();
    const usage = makeUsage({ checkAiCredits: vi.fn().mockResolvedValue({ allowed: false, remaining: 0, limit: 50 }) });
    const { service, ai } = makeService(client, undefined, usage);

    const result = await service.testChat("ws1", { question: "Do you ship to Kerala?" });

    expect(result.handover).toBe(true);
    expect(result.creditsRemaining).toBe(0);
    expect(ai.answerFromKnowledge).not.toHaveBeenCalled();
    expect(usage.debitAiReplyCredit).not.toHaveBeenCalled();
  });

  it("ranks knowledge chunks and FAQs, cites the top match, and debits one credit", async () => {
    const client = makeClient({
      knowledgeChunk: {
        findMany: vi.fn().mockResolvedValue([
          { id: "chunk1", sourceId: "src1", content: "Refunds are processed within 7 days.", source: { name: "Refund policy" } }
        ]),
        deleteMany: vi.fn(),
        create: vi.fn()
      },
      faq: {
        findMany: vi.fn().mockResolvedValue([{ id: "faq1", sourceId: null, question: "Do you ship pan-India?", answer: "Yes, everywhere." }]),
        update: vi.fn(),
        create: vi.fn(),
        findUniqueOrThrow: vi.fn(),
        updateMany: vi.fn(),
        deleteMany: vi.fn()
      }
    });
    const ai = makeAi({ answerFromKnowledge: vi.fn().mockResolvedValue({ answer: "Refunds take 7 days.", citedIndex: 1, handover: false }) });
    const usage = makeUsage();
    const { service } = makeService(client, ai, usage);

    const result = await service.testChat("ws1", { question: "What's your refund policy?" });

    expect(ai.answerFromKnowledge).toHaveBeenCalledWith(
      expect.objectContaining({ question: "What's your refund policy?", context: expect.stringContaining("Refund policy") })
    );
    expect(result.citedSourceId).toBe("src1");
    expect(result.citedSourceName).toBe("Refund policy");
    expect(result.creditsRemaining).toBe(48);
    expect(usage.debitAiReplyCredit).toHaveBeenCalledWith("ws1");
  });

  it("bumps a cited FAQ's usage count", async () => {
    const client = makeClient({
      knowledgeChunk: { findMany: vi.fn().mockResolvedValue([]), deleteMany: vi.fn(), create: vi.fn() },
      faq: {
        findMany: vi.fn().mockResolvedValue([{ id: "faq1", sourceId: null, question: "Do you ship pan-India?", answer: "Yes, everywhere." }]),
        update: vi.fn(),
        create: vi.fn(),
        findUniqueOrThrow: vi.fn(),
        updateMany: vi.fn(),
        deleteMany: vi.fn()
      }
    });
    const ai = makeAi({ answerFromKnowledge: vi.fn().mockResolvedValue({ answer: "Yes, everywhere.", citedIndex: 1, handover: false }) });
    const { service } = makeService(client, ai);

    await service.testChat("ws1", { question: "Do you ship pan-India?" });

    expect(client.faq.update).toHaveBeenCalledWith({ where: { id: "faq1" }, data: { usageCount: { increment: 1 } } });
  });
});

describe("KnowledgeService settings", () => {
  it("returns defaults when no settings row exists yet", async () => {
    const client = makeClient();
    const { service } = makeService(client);

    const result = await service.getSettings("ws1");
    expect(result.tone).toBe("friendly");
    expect(result.answerOnlyFromSources).toBe(true);
  });

  it("upserts on update", async () => {
    const client = makeClient({ aiSettings: { findUnique: vi.fn(), upsert: vi.fn().mockResolvedValue({ tone: "formal" }) } });
    const { service } = makeService(client);

    const result = await service.updateSettings("ws1", { tone: "formal" });
    expect(result).toEqual({ tone: "formal" });
    expect(client.aiSettings.upsert).toHaveBeenCalled();
  });
});
