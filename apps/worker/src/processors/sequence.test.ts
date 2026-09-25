import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  sequenceEnrollment: { findUnique: vi.fn(), update: vi.fn() },
  leadIdentity: { findMany: vi.fn() },
  whatsappNumber: { findFirst: vi.fn() },
  instagramAccount: { findFirst: vi.fn() },
  message: { create: vi.fn() },
  tag: { upsert: vi.fn() },
  leadTag: { upsert: vi.fn() },
  lead: { findUnique: vi.fn() },
  task: { create: vi.fn() }
}));

vi.mock("@zenora/db", () => ({ prisma: prismaMock }));
vi.mock("../decrypt-token", () => ({ decryptToken: () => "plaintext-token" }));
const sendWhatsappText = vi.hoisted(() => vi.fn().mockResolvedValue("wamid_1"));
const sendInstagramMessage = vi.hoisted(() => vi.fn().mockResolvedValue("ig_msg_1"));
vi.mock("../meta-send", () => ({ sendWhatsappText, sendInstagramMessage }));
vi.mock("../realtime", () => ({ publishInboxEvent: vi.fn() }));
const enqueueSequenceStep = vi.hoisted(() => vi.fn());
vi.mock("../routing/queue", () => ({ enqueueSequenceStep }));
const findOrCreateConversation = vi.hoisted(() => vi.fn().mockResolvedValue({ id: "conv1" }));
vi.mock("./conversation", () => ({ findOrCreateConversation }));

import { processSequenceStep } from "./sequence";

const steps = [
  { waitHours: 1, action: { type: "send_text", body: "Hi there" } },
  { waitHours: 24, action: { type: "tag", tagName: "followed-up" } }
];

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.leadIdentity.findMany.mockResolvedValue([{ type: "wa_phone", value: "919999999999" }]);
  prismaMock.whatsappNumber.findFirst.mockResolvedValue({ phoneNumberId: "phone_1", accessTokenCipher: "cipher" });
  prismaMock.tag.upsert.mockResolvedValue({ id: "tag1" });
  prismaMock.message.create.mockResolvedValue({ id: "msg1" });
});

describe("processSequenceStep", () => {
  it("no-ops when the enrollment was stopped", async () => {
    prismaMock.sequenceEnrollment.findUnique.mockResolvedValue({
      id: "enr1",
      status: "stopped",
      currentStep: 0,
      leadId: "lead1",
      sequence: { workspaceId: "ws1", steps }
    });

    await processSequenceStep("enr1");

    expect(sendWhatsappText).not.toHaveBeenCalled();
    expect(prismaMock.sequenceEnrollment.update).not.toHaveBeenCalled();
  });

  it("sends the step's text via WhatsApp and advances to the next step, queuing it by the next step's waitHours", async () => {
    prismaMock.sequenceEnrollment.findUnique.mockResolvedValue({
      id: "enr1",
      status: "active",
      currentStep: 0,
      leadId: "lead1",
      sequence: { workspaceId: "ws1", steps }
    });

    await processSequenceStep("enr1");

    expect(sendWhatsappText).toHaveBeenCalledWith("phone_1", "919999999999", "Hi there", "plaintext-token");
    expect(prismaMock.sequenceEnrollment.update).toHaveBeenCalledWith({ where: { id: "enr1" }, data: { currentStep: 1 } });
    expect(enqueueSequenceStep).toHaveBeenCalledWith("enr1", 24 * 3_600_000);
  });

  it("marks the enrollment completed once the last step has run", async () => {
    prismaMock.sequenceEnrollment.findUnique.mockResolvedValue({
      id: "enr1",
      status: "active",
      currentStep: 1,
      leadId: "lead1",
      sequence: { workspaceId: "ws1", steps }
    });

    await processSequenceStep("enr1");

    expect(prismaMock.tag.upsert).toHaveBeenCalled();
    expect(prismaMock.sequenceEnrollment.update).toHaveBeenCalledWith({ where: { id: "enr1" }, data: { currentStep: 2 } });
    expect(prismaMock.sequenceEnrollment.update).toHaveBeenCalledWith({ where: { id: "enr1" }, data: { status: "completed" } });
    expect(enqueueSequenceStep).not.toHaveBeenCalled();
  });

  it("marks completed immediately if currentStep is already past the end (defensive)", async () => {
    prismaMock.sequenceEnrollment.findUnique.mockResolvedValue({
      id: "enr1",
      status: "active",
      currentStep: 5,
      leadId: "lead1",
      sequence: { workspaceId: "ws1", steps }
    });

    await processSequenceStep("enr1");

    expect(prismaMock.sequenceEnrollment.update).toHaveBeenCalledWith({ where: { id: "enr1" }, data: { status: "completed" } });
  });

  it("logs and still advances the step when the send fails (a broken message doesn't stall the sequence)", async () => {
    sendWhatsappText.mockRejectedValueOnce(new Error("Meta API error"));
    prismaMock.sequenceEnrollment.findUnique.mockResolvedValue({
      id: "enr1",
      status: "active",
      currentStep: 0,
      leadId: "lead1",
      sequence: { workspaceId: "ws1", steps }
    });

    await processSequenceStep("enr1");

    expect(prismaMock.sequenceEnrollment.update).toHaveBeenCalledWith({ where: { id: "enr1" }, data: { currentStep: 1 } });
    expect(enqueueSequenceStep).toHaveBeenCalledWith("enr1", 24 * 3_600_000);
  });
});
