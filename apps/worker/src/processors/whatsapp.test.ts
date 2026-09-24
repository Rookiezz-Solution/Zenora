import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  whatsappNumber: { findUnique: vi.fn() },
  leadIdentity: { findUnique: vi.fn() },
  lead: { create: vi.fn() },
  conversation: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
  message: { upsert: vi.fn() }
}));

vi.mock("@zenora/db", () => ({ prisma: prismaMock }));
vi.mock("../realtime", () => ({ publishInboxEvent: vi.fn() }));

import { processWhatsappPayload } from "./whatsapp";

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.whatsappNumber.findUnique.mockResolvedValue({ id: "wa_num_1", workspaceId: "ws_1" });
  prismaMock.leadIdentity.findUnique.mockResolvedValue(null);
  prismaMock.lead.create.mockResolvedValue({ id: "lead_1" });
  prismaMock.conversation.findFirst.mockResolvedValue(null);
  prismaMock.conversation.create.mockResolvedValue({ id: "conv_1" });
});

describe("processWhatsappPayload", () => {
  it("stores an inbound text message, carrying the sender's profile name onto a new lead", async () => {
    await processWhatsappPayload({
      object: "whatsapp_business_account",
      entry: [
        {
          id: "waba_1",
          changes: [
            {
              field: "messages",
              value: {
                metadata: { phone_number_id: "phone_123" },
                contacts: [{ profile: { name: "Arun" }, wa_id: "919999999999" }],
                messages: [{ id: "wamid_1", from: "919999999999", timestamp: "1700000000", type: "text", text: { body: "PRICE" } }]
              }
            }
          ]
        }
      ]
    });

    expect(prismaMock.lead.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ name: "Arun", phone: "919999999999" }) })
    );
    expect(prismaMock.message.upsert).toHaveBeenCalledTimes(1);
    expect(prismaMock.message.upsert.mock.calls[0][0].create).toMatchObject({
      conversationId: "conv_1",
      direction: "inbound",
      type: "text",
      body: "PRICE",
      externalId: "wamid_1"
    });
  });

  it("skips changes for a phone number we haven't connected", async () => {
    prismaMock.whatsappNumber.findUnique.mockResolvedValue(null);

    await processWhatsappPayload({
      object: "whatsapp_business_account",
      entry: [
        {
          id: "waba_1",
          changes: [
            {
              field: "messages",
              value: {
                metadata: { phone_number_id: "unknown_phone" },
                messages: [{ id: "wamid_1", from: "919999999999", timestamp: "1700000000", type: "text", text: { body: "hi" } }]
              }
            }
          ]
        }
      ]
    });

    expect(prismaMock.message.upsert).not.toHaveBeenCalled();
  });

  it("ignores changes that aren't the messages field", async () => {
    await processWhatsappPayload({
      object: "whatsapp_business_account",
      entry: [{ id: "waba_1", changes: [{ field: "message_template_status_update", value: { metadata: { phone_number_id: "phone_123" } } }] }]
    });

    expect(prismaMock.whatsappNumber.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.message.upsert).not.toHaveBeenCalled();
  });
});
