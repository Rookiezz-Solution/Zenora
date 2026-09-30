import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  knowledgeSource: { findUnique: vi.fn(), update: vi.fn() },
  knowledgeChunk: { deleteMany: vi.fn(), create: vi.fn() },
  $transaction: vi.fn().mockImplementation((ops: Promise<unknown>[]) => Promise.all(ops))
}));

vi.mock("@zenora/db", () => ({ prisma: prismaMock }));

import { processKnowledgeSource } from "./knowledge";

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.$transaction.mockImplementation((ops: Promise<unknown>[]) => Promise.all(ops));
  prismaMock.knowledgeSource.update.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("processKnowledgeSource", () => {
  it("no-ops when the source no longer exists", async () => {
    prismaMock.knowledgeSource.findUnique.mockResolvedValue(null);

    await processKnowledgeSource("missing");

    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("fetches a website source, strips HTML, chunks it, and marks it ready", async () => {
    prismaMock.knowledgeSource.findUnique.mockResolvedValue({
      id: "src1",
      workspaceId: "ws1",
      type: "website",
      sourceUrl: "https://example.com/faq"
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve("<p>Returns within 7 days.</p>") }));

    await processKnowledgeSource("src1");

    expect(prismaMock.knowledgeChunk.deleteMany).toHaveBeenCalledWith({ where: { sourceId: "src1" } });
    expect(prismaMock.knowledgeChunk.create).toHaveBeenCalledWith({
      data: { workspaceId: "ws1", sourceId: "src1", content: "Returns within 7 days.", order: 0 }
    });
    expect(prismaMock.knowledgeSource.update).toHaveBeenCalledWith({
      where: { id: "src1" },
      data: { content: "Returns within 7 days.", status: "ready", errorMessage: null }
    });
  });

  it("marks the source failed with the error message when the fetch fails", async () => {
    prismaMock.knowledgeSource.findUnique.mockResolvedValue({
      id: "src1",
      workspaceId: "ws1",
      type: "website",
      sourceUrl: "https://example.com/faq"
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));

    await processKnowledgeSource("src1");

    expect(prismaMock.knowledgeSource.update).toHaveBeenCalledWith({
      where: { id: "src1" },
      data: { status: "failed", errorMessage: "Fetch failed with status 404" }
    });
  });

  it("marks the source failed for a non-website source with no URL", async () => {
    prismaMock.knowledgeSource.findUnique.mockResolvedValue({ id: "src1", workspaceId: "ws1", type: "text", sourceUrl: null });

    await processKnowledgeSource("src1");

    expect(prismaMock.knowledgeSource.update).toHaveBeenCalledWith({
      where: { id: "src1" },
      data: { status: "failed", errorMessage: "Only website sources are processed asynchronously" }
    });
  });
});
