import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  broadcast: { findUniqueOrThrow: vi.fn(), update: vi.fn() },
  whatsappNumber: { findFirst: vi.fn() },
  leadIdentity: { findFirst: vi.fn() },
  broadcastRecipient: { update: vi.fn() },
  message: { create: vi.fn() }
}));

vi.mock("@zenora/db", () => ({ prisma: prismaMock }));
vi.mock("../decrypt-token", () => ({ decryptToken: () => "plaintext-token" }));
const sendWhatsappTemplate = vi.hoisted(() => vi.fn().mockResolvedValue("wamid_1"));
vi.mock("../meta-send", () => ({ sendWhatsappTemplate }));
vi.mock("../realtime", () => ({ publishInboxEvent: vi.fn() }));
const findOrCreateConversation = vi.hoisted(() => vi.fn().mockResolvedValue({ id: "conv_1" }));
vi.mock("./conversation", () => ({ findOrCreateConversation }));

import { processBroadcast } from "./broadcast";

beforeEach(() => {
  vi.clearAllMocks();
  sendWhatsappTemplate.mockResolvedValue("wamid_1");
  findOrCreateConversation.mockResolvedValue({ id: "conv_1" });
  prismaMock.whatsappNumber.findFirst.mockResolvedValue({ phoneNumberId: "phone_1", accessTokenCipher: "cipher" });
  prismaMock.message.create.mockResolvedValue({ id: "msg_1" });
  prismaMock.broadcastRecipient.update.mockResolvedValue({});
  prismaMock.broadcast.update.mockResolvedValue({});
});

function makeBroadcast(recipients: Array<{ id: string; leadId: string }>) {
  return {
    id: "b1",
    workspaceId: "ws_1",
    template: { name: "welcome", language: "en", bodyText: "Hi there" },
    recipients
  };
}

describe("processBroadcast", () => {
  it("sends the template to every pending recipient and marks them sent", async () => {
    prismaMock.broadcast.findUniqueOrThrow.mockResolvedValue(
      makeBroadcast([{ id: "r1", leadId: "l1" }, { id: "r2", leadId: "l2" }])
    );
    prismaMock.leadIdentity.findFirst.mockResolvedValue({ value: "919999999999" });

    await processBroadcast("b1");

    expect(sendWhatsappTemplate).toHaveBeenCalledTimes(2);
    expect(sendWhatsappTemplate).toHaveBeenCalledWith("phone_1", "919999999999", "welcome", "en", "plaintext-token");
    expect(prismaMock.broadcastRecipient.update).toHaveBeenCalledWith({ where: { id: "r1" }, data: { status: "sent" } });
    expect(prismaMock.broadcastRecipient.update).toHaveBeenCalledWith({ where: { id: "r2" }, data: { status: "sent" } });
    expect(prismaMock.broadcast.update).toHaveBeenCalledWith({
      where: { id: "b1" },
      data: { status: "sent", sentAt: expect.any(Date) }
    });
  });

  it("skips a recipient with no WhatsApp identity instead of failing the whole run", async () => {
    prismaMock.broadcast.findUniqueOrThrow.mockResolvedValue(makeBroadcast([{ id: "r1", leadId: "l1" }]));
    prismaMock.leadIdentity.findFirst.mockResolvedValue(null);

    await processBroadcast("b1");

    expect(sendWhatsappTemplate).not.toHaveBeenCalled();
    expect(prismaMock.broadcastRecipient.update).toHaveBeenCalledWith({ where: { id: "r1" }, data: { status: "skipped" } });
    expect(prismaMock.broadcast.update).toHaveBeenCalledWith({ where: { id: "b1" }, data: { status: "sent", sentAt: expect.any(Date) } });
  });

  it("marks a recipient failed when the send throws, without aborting the rest of the run", async () => {
    prismaMock.broadcast.findUniqueOrThrow.mockResolvedValue(
      makeBroadcast([{ id: "r1", leadId: "l1" }, { id: "r2", leadId: "l2" }])
    );
    prismaMock.leadIdentity.findFirst.mockResolvedValue({ value: "919999999999" });
    sendWhatsappTemplate.mockRejectedValueOnce(new Error("Meta API error"));

    await processBroadcast("b1");

    expect(prismaMock.broadcastRecipient.update).toHaveBeenCalledWith({ where: { id: "r1" }, data: { status: "failed" } });
    expect(prismaMock.broadcastRecipient.update).toHaveBeenCalledWith({ where: { id: "r2" }, data: { status: "sent" } });
    expect(prismaMock.broadcast.update).toHaveBeenCalledWith({ where: { id: "b1" }, data: { status: "sent", sentAt: expect.any(Date) } });
  });

  it("marks the whole broadcast failed when no WhatsApp number is connected", async () => {
    prismaMock.broadcast.findUniqueOrThrow.mockResolvedValue(makeBroadcast([{ id: "r1", leadId: "l1" }]));
    prismaMock.whatsappNumber.findFirst.mockResolvedValue(null);

    await processBroadcast("b1");

    expect(sendWhatsappTemplate).not.toHaveBeenCalled();
    expect(prismaMock.broadcast.update).toHaveBeenCalledWith({ where: { id: "b1" }, data: { status: "failed" } });
  });
});
