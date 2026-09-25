import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  whatsappNumber: { findUnique: vi.fn() },
  leadIdentity: { findUnique: vi.fn() },
  lead: { create: vi.fn() },
  conversation: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
  message: { upsert: vi.fn() },
  waTemplate: { findFirst: vi.fn(), update: vi.fn() }
}));

vi.mock("@zenora/db", () => ({ prisma: prismaMock }));
vi.mock("../realtime", () => ({ publishInboxEvent: vi.fn() }));
const findMatchingAutomations = vi.hoisted(() => vi.fn().mockResolvedValue([]));
const enqueueStart = vi.hoisted(() => vi.fn());
vi.mock("../automation-engine/trigger-matcher", () => ({ findMatchingAutomations }));
vi.mock("../automation-engine/queue", () => ({ enqueueStart }));
vi.mock("./routing", () => ({ applyToNewLead: vi.fn() }));

import { processWhatsappPayload } from "./whatsapp";

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.whatsappNumber.findUnique.mockResolvedValue({ id: "wa_num_1", workspaceId: "ws_1" });
  prismaMock.leadIdentity.findUnique.mockResolvedValue(null);
  prismaMock.lead.create.mockResolvedValue({ id: "lead_1" });
  prismaMock.conversation.findFirst.mockResolvedValue(null);
  prismaMock.conversation.create.mockResolvedValue({ id: "conv_1", botActive: true });
  findMatchingAutomations.mockResolvedValue([]);
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

  it("ignores an unrecognized field", async () => {
    await processWhatsappPayload({
      object: "whatsapp_business_account",
      entry: [{ id: "waba_1", changes: [{ field: "some_other_field", value: {} }] }]
    });

    expect(prismaMock.whatsappNumber.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.message.upsert).not.toHaveBeenCalled();
  });

  it("skips a template status update with no event or template id", async () => {
    await processWhatsappPayload({
      object: "whatsapp_business_account",
      entry: [{ id: "waba_1", changes: [{ field: "message_template_status_update", value: {} }] }]
    });

    expect(prismaMock.waTemplate.findFirst).not.toHaveBeenCalled();
  });

  it("syncs an approved template's status from the webhook", async () => {
    prismaMock.waTemplate.findFirst.mockResolvedValue({ id: "tpl_1", metaTemplateId: "999" });

    await processWhatsappPayload({
      object: "whatsapp_business_account",
      entry: [
        {
          id: "waba_1",
          changes: [
            { field: "message_template_status_update", value: { event: "APPROVED", message_template_id: 999, message_template_name: "welcome" } }
          ]
        }
      ]
    });

    expect(prismaMock.waTemplate.findFirst).toHaveBeenCalledWith({ where: { metaTemplateId: "999" } });
    expect(prismaMock.waTemplate.update).toHaveBeenCalledWith({
      where: { id: "tpl_1" },
      data: { metaStatus: "approved", rejectionReason: null }
    });
  });

  it("records the rejection reason on a rejected template", async () => {
    prismaMock.waTemplate.findFirst.mockResolvedValue({ id: "tpl_1", metaTemplateId: "999" });

    await processWhatsappPayload({
      object: "whatsapp_business_account",
      entry: [
        {
          id: "waba_1",
          changes: [
            {
              field: "message_template_status_update",
              value: { event: "REJECTED", message_template_id: 999, reason: "INCORRECT_CATEGORY" }
            }
          ]
        }
      ]
    });

    expect(prismaMock.waTemplate.update).toHaveBeenCalledWith({
      where: { id: "tpl_1" },
      data: { metaStatus: "rejected", rejectionReason: "INCORRECT_CATEGORY" }
    });
  });

  it("no-ops when the status update doesn't match any known template", async () => {
    prismaMock.waTemplate.findFirst.mockResolvedValue(null);

    await processWhatsappPayload({
      object: "whatsapp_business_account",
      entry: [{ id: "waba_1", changes: [{ field: "message_template_status_update", value: { event: "APPROVED", message_template_id: 999 } }] }]
    });

    expect(prismaMock.waTemplate.update).not.toHaveBeenCalled();
  });

  it("starts a run for a matching automation when the bot is active", async () => {
    findMatchingAutomations.mockResolvedValue([{ id: "auto_1" }]);

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
                messages: [{ id: "wamid_1", from: "919999999999", timestamp: "1700000000", type: "text", text: { body: "PRICE" } }]
              }
            }
          ]
        }
      ]
    });

    expect(findMatchingAutomations).toHaveBeenCalledWith("ws_1", "whatsapp_message_keyword", "PRICE", "lead_1");
    expect(enqueueStart).toHaveBeenCalledWith("auto_1", "lead_1", "conv_1");
  });

  it("doesn't check for automation triggers once a human has taken over the conversation", async () => {
    prismaMock.conversation.create.mockResolvedValue({ id: "conv_1", botActive: false });

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
                messages: [{ id: "wamid_1", from: "919999999999", timestamp: "1700000000", type: "text", text: { body: "PRICE" } }]
              }
            }
          ]
        }
      ]
    });

    expect(findMatchingAutomations).not.toHaveBeenCalled();
  });
});
