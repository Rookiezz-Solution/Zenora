import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  leadIdentity: { findUnique: vi.fn() },
  lead: { create: vi.fn() }
}));

vi.mock("@zenora/db", () => ({ prisma: prismaMock }));
const applyToNewLead = vi.hoisted(() => vi.fn());
vi.mock("./routing", () => ({ applyToNewLead }));
const emitWebhookEvent = vi.hoisted(() => vi.fn());
vi.mock("../webhooks/emit", () => ({ emitWebhookEvent }));

import { findOrCreateLeadByIdentity } from "./lead-identity";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("findOrCreateLeadByIdentity", () => {
  it("reuses the lead already linked to a known identity", async () => {
    const existingLead = { id: "lead_1" };
    prismaMock.leadIdentity.findUnique.mockResolvedValue({ lead: existingLead });

    const result = await findOrCreateLeadByIdentity("ws_1", "ig_scoped_id", "ig_abc");

    expect(result).toBe(existingLead);
    expect(prismaMock.lead.create).not.toHaveBeenCalled();
    expect(prismaMock.leadIdentity.findUnique).toHaveBeenCalledWith({
      where: { type_value: { type: "ig_scoped_id", value: "ig_abc" } },
      include: { lead: true }
    });
    expect(applyToNewLead).not.toHaveBeenCalled();
    expect(emitWebhookEvent).not.toHaveBeenCalled();
  });

  it("creates a new lead with the identity attached when none exists", async () => {
    prismaMock.leadIdentity.findUnique.mockResolvedValue(null);
    const newLead = { id: "lead_2", name: "Arun", phone: "+919999999999", email: null, source: "whatsapp", stageId: null, createdAt: new Date("2026-10-05T00:00:00Z") };
    prismaMock.lead.create.mockResolvedValue(newLead);

    const result = await findOrCreateLeadByIdentity("ws_1", "wa_phone", "+919999999999", {
      name: "Arun",
      phone: "+919999999999"
    });

    expect(result).toBe(newLead);
    expect(emitWebhookEvent).toHaveBeenCalledWith("ws_1", "lead.created", expect.objectContaining({ id: "lead_2", source: "whatsapp" }));
    expect(prismaMock.lead.create).toHaveBeenCalledWith({
      data: {
        workspaceId: "ws_1",
        name: "Arun",
        phone: "+919999999999",
        source: "whatsapp",
        identities: { create: { type: "wa_phone", value: "+919999999999" } }
      }
    });
    expect(applyToNewLead).toHaveBeenCalledWith("ws_1", "lead_2");
  });
});
