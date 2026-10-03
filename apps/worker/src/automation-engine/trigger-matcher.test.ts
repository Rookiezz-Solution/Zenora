import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  automation: { findMany: vi.fn() },
  automationRun: { findMany: vi.fn() },
  lead: { findUnique: vi.fn() }
}));

vi.mock("@zenora/db", () => ({ prisma: prismaMock }));

import { findMatchingAutomations } from "./trigger-matcher";

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.automationRun.findMany.mockResolvedValue([]);
});

function candidate(id: string, config: unknown, hasPublishedVersion = true) {
  return {
    id,
    trigger: { type: "whatsapp_message_keyword", config },
    versions: hasPublishedVersion ? [{ id: `${id}-v1` }] : []
  };
}

describe("findMatchingAutomations", () => {
  it("matches a 'contains' keyword case-insensitively", async () => {
    prismaMock.automation.findMany.mockResolvedValue([candidate("auto_1", { keywords: ["price"], matchType: "contains" })]);

    const result = await findMatchingAutomations("ws_1", "whatsapp_message_keyword", "What's the PRICE?", "lead_1");

    expect(result.map((a) => a.id)).toEqual(["auto_1"]);
  });

  it("requires an exact match for matchType 'exact'", async () => {
    prismaMock.automation.findMany.mockResolvedValue([candidate("auto_1", { keywords: ["hi"], matchType: "exact" })]);

    const noMatch = await findMatchingAutomations("ws_1", "whatsapp_message_keyword", "hi there", "lead_1");
    expect(noMatch).toEqual([]);

    const match = await findMatchingAutomations("ws_1", "whatsapp_message_keyword", "hi", "lead_1");
    expect(match.map((a) => a.id)).toEqual(["auto_1"]);
  });

  it("matches any message when matchType is 'any'", async () => {
    prismaMock.automation.findMany.mockResolvedValue([candidate("auto_1", { keywords: [], matchType: "any" })]);

    const result = await findMatchingAutomations("ws_1", "whatsapp_message_keyword", "literally anything", "lead_1");

    expect(result.map((a) => a.id)).toEqual(["auto_1"]);
  });

  it("skips an automation with no published version even if the keyword matches", async () => {
    prismaMock.automation.findMany.mockResolvedValue([candidate("auto_1", { keywords: ["price"], matchType: "contains" }, false)]);

    const result = await findMatchingAutomations("ws_1", "whatsapp_message_keyword", "price?", "lead_1");

    expect(result).toEqual([]);
  });

  it("skips an automation that already has a run in progress for this lead", async () => {
    prismaMock.automation.findMany.mockResolvedValue([candidate("auto_1", { keywords: ["price"], matchType: "contains" })]);
    prismaMock.automationRun.findMany.mockResolvedValue([{ automationId: "auto_1", status: "running" }]);

    const result = await findMatchingAutomations("ws_1", "whatsapp_message_keyword", "price?", "lead_1");

    expect(result).toEqual([]);
  });

  it("allows re-firing after a completed run by default", async () => {
    prismaMock.automation.findMany.mockResolvedValue([candidate("auto_1", { keywords: ["price"], matchType: "contains" })]);
    prismaMock.automationRun.findMany.mockResolvedValue([{ automationId: "auto_1", status: "completed" }]);

    const result = await findMatchingAutomations("ws_1", "whatsapp_message_keyword", "price?", "lead_1");

    expect(result.map((a) => a.id)).toEqual(["auto_1"]);
  });

  it("blocks re-firing after a completed run when onceForLead is set", async () => {
    prismaMock.automation.findMany.mockResolvedValue([
      candidate("auto_1", { keywords: ["price"], matchType: "contains", limits: { onceForLead: true } })
    ]);
    prismaMock.automationRun.findMany.mockResolvedValue([{ automationId: "auto_1", status: "completed" }]);

    const result = await findMatchingAutomations("ws_1", "whatsapp_message_keyword", "price?", "lead_1");

    expect(result).toEqual([]);
  });

  it("requires every extra condition to match the lead's context", async () => {
    prismaMock.automation.findMany.mockResolvedValue([
      candidate("auto_1", {
        keywords: [],
        matchType: "any",
        conditions: [
          { field: "source", operator: "equals", value: "instagram" },
          { field: "tag", operator: "contains", value: "vip" }
        ]
      })
    ]);
    prismaMock.lead.findUnique.mockResolvedValue({ source: "instagram", tags: [{ tag: { name: "vip" } }], fieldValues: [] });

    const match = await findMatchingAutomations("ws_1", "whatsapp_message_keyword", "hello", "lead_1");
    expect(match.map((a) => a.id)).toEqual(["auto_1"]);

    prismaMock.lead.findUnique.mockResolvedValue({ source: "instagram", tags: [], fieldValues: [] });
    const noMatch = await findMatchingAutomations("ws_1", "whatsapp_message_keyword", "hello", "lead_1");
    expect(noMatch).toEqual([]);
  });

  it("doesn't query the lead when no automation has extra conditions", async () => {
    prismaMock.automation.findMany.mockResolvedValue([candidate("auto_1", { keywords: [], matchType: "any" })]);

    await findMatchingAutomations("ws_1", "whatsapp_message_keyword", "hello", "lead_1");

    expect(prismaMock.lead.findUnique).not.toHaveBeenCalled();
  });

  it("attaches the trigger's delay in milliseconds to each match", async () => {
    prismaMock.automation.findMany.mockResolvedValue([
      candidate("auto_1", { keywords: [], matchType: "any", limits: { delayMinutes: 10 } }),
      candidate("auto_2", { keywords: [], matchType: "any" })
    ]);

    const result = await findMatchingAutomations("ws_1", "whatsapp_message_keyword", "hello", "lead_1");

    expect(result.map((a) => [a.id, a.delayMs])).toEqual([
      ["auto_1", 600_000],
      ["auto_2", 0]
    ]);
  });
});
