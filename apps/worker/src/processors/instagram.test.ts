import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  instagramAccount: { findUnique: vi.fn() },
  leadIdentity: { findUnique: vi.fn() },
  lead: { create: vi.fn() },
  conversation: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
  message: { upsert: vi.fn() }
}));

vi.mock("@zenora/db", () => ({ prisma: prismaMock }));
vi.mock("../realtime", () => ({ publishInboxEvent: vi.fn() }));
const findMatchingAutomations = vi.hoisted(() => vi.fn().mockResolvedValue([]));
const enqueueStart = vi.hoisted(() => vi.fn());
vi.mock("../automation-engine/trigger-matcher", () => ({ findMatchingAutomations }));
vi.mock("../automation-engine/queue", () => ({ enqueueStart }));
vi.mock("./routing", () => ({ applyToNewLead: vi.fn() }));

import { processInstagramPayload } from "./instagram";

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.instagramAccount.findUnique.mockResolvedValue({ id: "ig_acct_1", workspaceId: "ws_1" });
  prismaMock.leadIdentity.findUnique.mockResolvedValue(null);
  prismaMock.lead.create.mockResolvedValue({ id: "lead_1" });
  prismaMock.conversation.findFirst.mockResolvedValue(null);
  prismaMock.conversation.create.mockResolvedValue({ id: "conv_1", botActive: true });
  findMatchingAutomations.mockResolvedValue([]);
});

describe("processInstagramPayload", () => {
  it("stores an inbound DM as a message on a new conversation", async () => {
    await processInstagramPayload({
      object: "instagram",
      entry: [
        {
          id: "ig_business_123",
          messaging: [
            {
              sender: { id: "ig_scoped_456" },
              recipient: { id: "ig_business_123" },
              timestamp: 1700000000000,
              message: { mid: "mid_1", text: "PRICE" }
            }
          ]
        }
      ]
    });

    expect(prismaMock.message.upsert).toHaveBeenCalledTimes(1);
    const call = prismaMock.message.upsert.mock.calls[0][0];
    expect(call.create).toMatchObject({
      conversationId: "conv_1",
      direction: "inbound",
      type: "text",
      body: "PRICE",
      externalId: "mid_1"
    });
  });

  it("ignores echoes of the business account's own outbound sends", async () => {
    await processInstagramPayload({
      object: "instagram",
      entry: [
        {
          id: "ig_business_123",
          messaging: [
            {
              sender: { id: "ig_business_123" },
              recipient: { id: "ig_scoped_456" },
              timestamp: 1700000000000,
              message: { mid: "mid_echo", text: "Thanks for reaching out!" }
            }
          ]
        }
      ]
    });

    expect(prismaMock.message.upsert).not.toHaveBeenCalled();
  });

  it("skips entries for an Instagram account we haven't connected", async () => {
    prismaMock.instagramAccount.findUnique.mockResolvedValue(null);

    await processInstagramPayload({
      object: "instagram",
      entry: [
        {
          id: "ig_unknown",
          messaging: [
            { sender: { id: "ig_scoped_456" }, recipient: { id: "ig_unknown" }, timestamp: 1, message: { mid: "mid_1", text: "hi" } }
          ]
        }
      ]
    });

    expect(prismaMock.message.upsert).not.toHaveBeenCalled();
  });

  it("starts a run for every automation whose keyword trigger matches, when the bot is active", async () => {
    findMatchingAutomations.mockResolvedValue([{ id: "auto_1" }, { id: "auto_2" }]);

    await processInstagramPayload({
      object: "instagram",
      entry: [
        {
          id: "ig_business_123",
          messaging: [
            { sender: { id: "ig_scoped_456" }, recipient: { id: "ig_business_123" }, timestamp: 1, message: { mid: "mid_1", text: "PRICE" } }
          ]
        }
      ]
    });

    expect(findMatchingAutomations).toHaveBeenCalledWith("ws_1", "instagram_dm_keyword", "PRICE", "lead_1");
    expect(enqueueStart).toHaveBeenCalledWith("auto_1", "lead_1", "conv_1");
    expect(enqueueStart).toHaveBeenCalledWith("auto_2", "lead_1", "conv_1");
  });

  it("doesn't check for automation triggers once a human has taken over the conversation", async () => {
    prismaMock.conversation.create.mockResolvedValue({ id: "conv_1", botActive: false });

    await processInstagramPayload({
      object: "instagram",
      entry: [
        {
          id: "ig_business_123",
          messaging: [
            { sender: { id: "ig_scoped_456" }, recipient: { id: "ig_business_123" }, timestamp: 1, message: { mid: "mid_1", text: "PRICE" } }
          ]
        }
      ]
    });

    expect(findMatchingAutomations).not.toHaveBeenCalled();
  });
});
