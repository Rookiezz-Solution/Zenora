import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FlowGraph } from "@zenora/shared";

const prismaMock = vi.hoisted(() => ({
  automationRun: { create: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
  automation: { findUniqueOrThrow: vi.fn() },
  runStep: { create: vi.fn() },
  conversation: { findUniqueOrThrow: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
  lead: { findUniqueOrThrow: vi.fn(), update: vi.fn() },
  tag: { upsert: vi.fn() },
  leadTag: { upsert: vi.fn() },
  stage: { findUnique: vi.fn() },
  assignment: { create: vi.fn() },
  message: { create: vi.fn() },
  instagramAccount: { findFirst: vi.fn() },
  whatsappNumber: { findFirst: vi.fn() },
  leadIdentity: { findFirst: vi.fn() }
}));

vi.mock("@zenora/db", () => ({ prisma: prismaMock }));
vi.mock("../realtime", () => ({ publishInboxEvent: vi.fn() }));
vi.mock("../decrypt-token", () => ({ decryptToken: vi.fn().mockReturnValue("plaintext-token") }));
vi.mock("../meta-send", () => ({
  sendInstagramMessage: vi.fn().mockResolvedValue("ig-msg-id"),
  sendWhatsappText: vi.fn().mockResolvedValue("wa-msg-id")
}));
const enqueueResume = vi.hoisted(() => vi.fn());
vi.mock("./queue", () => ({ enqueueResume }));

import { resumeRun, startRun } from "./engine";

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.automationRun.create.mockResolvedValue({ id: "run_1" });
  prismaMock.conversation.findUniqueOrThrow.mockResolvedValue({ id: "conv_1", channel: "whatsapp", leadId: "lead_1" });
  prismaMock.conversation.findUnique.mockResolvedValue({ id: "conv_1", botActive: false });
  prismaMock.whatsappNumber.findFirst.mockResolvedValue({ phoneNumberId: "phone_1", accessTokenCipher: "cipher" });
  prismaMock.leadIdentity.findFirst.mockResolvedValue({ value: "919999999999" });
  prismaMock.message.create.mockResolvedValue({ id: "msg_1" });
});

function mockAutomation(graph: FlowGraph) {
  prismaMock.automation.findUniqueOrThrow.mockResolvedValue({
    id: "auto_1",
    workspaceId: "ws_1",
    versions: [{ graph }]
  });
}

describe("startRun", () => {
  it("walks a linear flow through to completion", async () => {
    const graph: FlowGraph = {
      startBlockId: "a",
      blocks: {
        a: { id: "a", type: "send_text", body: "Hi!", next: "b" },
        b: { id: "b", type: "tag", tagName: "warm", next: "c" },
        c: { id: "c", type: "handover" }
      }
    };
    mockAutomation(graph);
    prismaMock.tag.upsert.mockResolvedValue({ id: "tag_1" });

    await startRun("auto_1", "lead_1", "conv_1");

    expect(prismaMock.message.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ body: "Hi!", direction: "outbound" }) })
    );
    expect(prismaMock.leadTag.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: { leadId: "lead_1", tagId: "tag_1" } })
    );
    expect(prismaMock.conversation.update).toHaveBeenCalledWith({ where: { id: "conv_1" }, data: { botActive: false } });
    expect(prismaMock.runStep.create).toHaveBeenCalledTimes(3);
    expect(prismaMock.automationRun.update).toHaveBeenCalledWith({
      where: { id: "run_1" },
      data: { status: "completed", completedAt: expect.any(Date) }
    });
  });

  it("suspends at a wait block instead of continuing in the same tick", async () => {
    const graph: FlowGraph = {
      startBlockId: "a",
      blocks: {
        a: { id: "a", type: "wait", minutes: 60, next: "b" },
        b: { id: "b", type: "handover" }
      }
    };
    mockAutomation(graph);

    await startRun("auto_1", "lead_1", "conv_1");

    expect(enqueueResume).toHaveBeenCalledWith("run_1", "b", 60);
    expect(prismaMock.runStep.create).toHaveBeenCalledTimes(1);
    // Suspended, not completed — resumeRun finishes it later.
    expect(prismaMock.automationRun.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "completed" }) })
    );
  });

  it("branches on a condition block based on the lead's tags", async () => {
    const graph: FlowGraph = {
      startBlockId: "a",
      blocks: {
        a: { id: "a", type: "condition", field: "tag", operator: "equals", value: "vip", ifTrue: "yes", ifFalse: "no" },
        yes: { id: "yes", type: "tag", tagName: "priority", next: null },
        no: { id: "no", type: "handover" }
      }
    };
    mockAutomation(graph);
    prismaMock.lead.findUniqueOrThrow.mockResolvedValue({ score: 0, tags: [{ tag: { name: "vip" } }], stage: null });
    prismaMock.tag.upsert.mockResolvedValue({ id: "tag_priority" });

    await startRun("auto_1", "lead_1", "conv_1");

    expect(prismaMock.leadTag.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: { leadId: "lead_1", tagId: "tag_priority" } })
    );
    expect(prismaMock.conversation.update).not.toHaveBeenCalled(); // "no" branch (handover) never ran
  });

  it("marks the run failed and records the error when a block throws", async () => {
    const graph: FlowGraph = {
      startBlockId: "a",
      blocks: { a: { id: "a", type: "send_text", body: "Hi!", next: null } }
    };
    mockAutomation(graph);
    prismaMock.whatsappNumber.findFirst.mockResolvedValue(null); // triggers "No connected WhatsApp number"

    await startRun("auto_1", "lead_1", "conv_1");

    expect(prismaMock.runStep.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "error" }) })
    );
    expect(prismaMock.automationRun.update).toHaveBeenCalledWith({
      where: { id: "run_1" },
      data: { status: "failed", completedAt: expect.any(Date) }
    });
  });

  it("marks the run failed with no steps when the automation has no published version", async () => {
    prismaMock.automation.findUniqueOrThrow.mockResolvedValue({ id: "auto_1", workspaceId: "ws_1", versions: [] });

    await startRun("auto_1", "lead_1", "conv_1");

    expect(prismaMock.runStep.create).not.toHaveBeenCalled();
    expect(prismaMock.automationRun.update).toHaveBeenCalledWith({
      where: { id: "run_1" },
      data: { status: "failed", completedAt: expect.any(Date) }
    });
  });
});

describe("resumeRun", () => {
  it("continues from the given block using the run's lead and conversation", async () => {
    const graph: FlowGraph = {
      startBlockId: "a",
      blocks: {
        a: { id: "a", type: "wait", minutes: 1, next: "b" },
        b: { id: "b", type: "handover" }
      }
    };
    prismaMock.automationRun.findUnique.mockResolvedValue({
      id: "run_1",
      status: "running",
      leadId: "lead_1",
      automation: { workspaceId: "ws_1", versions: [{ graph }] }
    });
    prismaMock.conversation.findFirst.mockResolvedValue({ id: "conv_1" });

    await resumeRun("run_1", "b");

    expect(prismaMock.conversation.update).toHaveBeenCalledWith({ where: { id: "conv_1" }, data: { botActive: false } });
    expect(prismaMock.automationRun.update).toHaveBeenCalledWith({
      where: { id: "run_1" },
      data: { status: "completed", completedAt: expect.any(Date) }
    });
  });

  it("does nothing if the run isn't in a running state (e.g. already failed)", async () => {
    prismaMock.automationRun.findUnique.mockResolvedValue({ id: "run_1", status: "failed", leadId: "lead_1" });

    await resumeRun("run_1", "b");

    expect(prismaMock.runStep.create).not.toHaveBeenCalled();
  });
});
