import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  automation: { findMany: vi.fn() },
  automationRun: { findMany: vi.fn() },
  lead: { findUnique: vi.fn() }
}));
const enqueueStart = vi.hoisted(() => vi.fn());

vi.mock("@zenora/db", () => ({ prisma: prismaMock }));
vi.mock("./queue", () => ({ enqueueStart }));

import { fireNewLeadScoreEvent } from "../processors/lead-events";
import { findCrmEventAutomations, findMatchingAutomations } from "./trigger-matcher";

const lead = (extra: Record<string, unknown> = {}) => ({ id: "lead1", source: "whatsapp", score: 30, tags: [{ tag: { name: "vip" } }], fieldValues: [], ...extra });
const candidate = (id: string, type: string, config: unknown) => ({ id, trigger: { type, config }, versions: [{ id: `${id}-v1` }] });

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.automationRun.findMany.mockResolvedValue([]);
  prismaMock.lead.findUnique.mockResolvedValue(lead());
});

describe("findCrmEventAutomations", () => {
  it("finds a score_reached automation when the score crosses its line", async () => {
    prismaMock.automation.findMany.mockResolvedValue([candidate("a1", "score_reached", { threshold: 25 }), candidate("a2", "score_reached", { threshold: 80 })]);
    const r = await findCrmEventAutomations("ws1", "lead1", "score_reached", { scoreBefore: 0, scoreAfter: 30 });
    expect(r.map((a) => a.id)).toEqual(["a1"]);
    expect(prismaMock.automation.findMany.mock.calls[0]![0].where).toMatchObject({ workspaceId: "ws1", status: "live", trigger: { type: "score_reached" } });
  });

  it("applies OR conditions and the delay limit", async () => {
    const conditions = [{ field: "source", operator: "equals", value: "instagram" }, { field: "tag", operator: "equals", value: "vip" }];
    prismaMock.automation.findMany.mockResolvedValue([candidate("a1", "score_reached", { threshold: 10, conditions, conditionMode: "any", limits: { delayMinutes: 2 } })]);
    const r = await findCrmEventAutomations("ws1", "lead1", "score_reached", { scoreBefore: 0, scoreAfter: 30 });
    expect(r).toHaveLength(1);
    expect(r[0]!.delayMs).toBe(120_000);
  });

  it("skips one that already ran when limited to once per lead", async () => {
    prismaMock.automation.findMany.mockResolvedValue([candidate("a1", "score_reached", { threshold: 10, limits: { onceForLead: true } })]);
    prismaMock.automationRun.findMany.mockResolvedValue([{ automationId: "a1", status: "completed" }]);
    expect(await findCrmEventAutomations("ws1", "lead1", "score_reached", { scoreBefore: 0, scoreAfter: 30 })).toEqual([]);
  });
});

describe("keyword triggers with OR conditions", () => {
  it("passes when any one condition holds in 'any' mode, and needs all by default", async () => {
    const conditions = [{ field: "source", operator: "equals", value: "instagram" }, { field: "tag", operator: "equals", value: "vip" }];
    const kw = (config: object) => candidate("k1", "whatsapp_message_keyword", { keywords: ["price"], matchType: "contains", conditions, ...config });
    prismaMock.automation.findMany.mockResolvedValue([kw({ conditionMode: "any" })]);
    expect(await findMatchingAutomations("ws1", "whatsapp_message_keyword", "price?", "lead1")).toHaveLength(1);
    prismaMock.automation.findMany.mockResolvedValue([kw({})]);
    expect(await findMatchingAutomations("ws1", "whatsapp_message_keyword", "price?", "lead1")).toHaveLength(0);
  });
});

describe("fireNewLeadScoreEvent", () => {
  it("starts matching automations for a new lead's first score, through the conversation just created", async () => {
    prismaMock.automation.findMany.mockResolvedValue([candidate("a1", "score_reached", { threshold: 20 })]);
    await fireNewLeadScoreEvent("ws1", "lead1", "conv1");
    expect(enqueueStart).toHaveBeenCalledWith("a1", "lead1", "conv1", 0);
  });

  it("does nothing for an unscored lead", async () => {
    prismaMock.lead.findUnique.mockResolvedValue(lead({ score: 0 }));
    await fireNewLeadScoreEvent("ws1", "lead1", "conv1");
    expect(prismaMock.automation.findMany).not.toHaveBeenCalled();
    expect(enqueueStart).not.toHaveBeenCalled();
  });

  it("never throws into message handling", async () => {
    prismaMock.automation.findMany.mockRejectedValue(new Error("db down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(fireNewLeadScoreEvent("ws1", "lead1", "conv1")).resolves.toBeUndefined();
    spy.mockRestore();
  });
});
