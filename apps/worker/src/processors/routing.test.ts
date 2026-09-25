import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  lead: { findUnique: vi.fn(), update: vi.fn(), count: vi.fn() },
  scoringRule: { findMany: vi.fn() },
  routingRule: { findMany: vi.fn() },
  membership: { findMany: vi.fn(), findFirst: vi.fn() },
  assignment: { create: vi.fn(), count: vi.fn() },
  workspace: { findUniqueOrThrow: vi.fn() },
  slaTimer: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  user: { findUnique: vi.fn() },
  whatsappNumber: { findFirst: vi.fn() },
  $transaction: vi.fn().mockImplementation((ops: Promise<unknown>[]) => Promise.all(ops))
}));

vi.mock("@zenora/db", () => ({ prisma: prismaMock }));
vi.mock("../decrypt-token", () => ({ decryptToken: () => "plaintext-token" }));
const sendWhatsappText = vi.hoisted(() => vi.fn().mockResolvedValue("wamid_1"));
vi.mock("../meta-send", () => ({ sendWhatsappText }));
const enqueueSalespersonAlert = vi.hoisted(() => vi.fn());
const enqueueSlaCheck = vi.hoisted(() => vi.fn());
vi.mock("../routing/queue", () => ({ enqueueSalespersonAlert, enqueueSlaCheck }));

import { applyToNewLead, processSalespersonAlert, processSlaCheck } from "./routing";

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.lead.findUnique.mockResolvedValue({ id: "lead1", source: "instagram", tags: [], fieldValues: [], ownerId: null });
  prismaMock.scoringRule.findMany.mockResolvedValue([]);
  prismaMock.routingRule.findMany.mockResolvedValue([]);
  prismaMock.membership.findMany.mockResolvedValue([{ userId: "u1", available: true }]);
  prismaMock.lead.count.mockResolvedValue(0);
  prismaMock.assignment.count.mockResolvedValue(0);
  prismaMock.workspace.findUniqueOrThrow.mockResolvedValue({ id: "ws1", slaMinutes: 30 });
  prismaMock.slaTimer.create.mockResolvedValue({ id: "timer1" });
});

describe("applyToNewLead", () => {
  it("assigns the only available member and starts an SLA timer + alert", async () => {
    await applyToNewLead("ws1", "lead1");

    expect(prismaMock.lead.update).toHaveBeenCalledWith({ where: { id: "lead1" }, data: { ownerId: "u1" } });
    expect(prismaMock.assignment.create).toHaveBeenCalledWith({ data: { leadId: "lead1", userId: "u1", reassignedFromId: null } });
    expect(enqueueSalespersonAlert).toHaveBeenCalledWith("ws1", "lead1", "u1");
    expect(enqueueSlaCheck).toHaveBeenCalledWith("timer1", 30 * 60_000);
  });

  it("never throws even if a DB call fails mid-routing", async () => {
    prismaMock.lead.findUnique.mockRejectedValue(new Error("db down"));
    await expect(applyToNewLead("ws1", "lead1")).resolves.toBeUndefined();
  });
});

describe("processSlaCheck", () => {
  it("no-ops when the timer was already resolved", async () => {
    prismaMock.slaTimer.findUnique.mockResolvedValue({ id: "t1", leadId: "lead1", workspaceId: "ws1", resolvedAt: new Date(), escalatedAt: null });

    await processSlaCheck("t1");

    expect(prismaMock.assignment.create).not.toHaveBeenCalled();
  });

  it("reassigns to another available member, excluding the current owner, when under the reassign limit", async () => {
    prismaMock.slaTimer.findUnique.mockResolvedValue({ id: "t1", leadId: "lead1", workspaceId: "ws1", resolvedAt: null, escalatedAt: null });
    prismaMock.lead.findUnique.mockResolvedValue({ id: "lead1", ownerId: "u1" });
    prismaMock.assignment.count.mockResolvedValue(1);
    prismaMock.membership.findMany.mockResolvedValue([{ userId: "u2", available: true }]);

    await processSlaCheck("t1");

    expect(prismaMock.membership.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: { not: "u1" } }) })
    );
    expect(prismaMock.assignment.create).toHaveBeenCalledWith({ data: { leadId: "lead1", userId: "u2", reassignedFromId: "u1" } });
    expect(enqueueSalespersonAlert).toHaveBeenCalledWith("ws1", "lead1", "u2");
  });

  it("escalates to a manager after the reassign limit is hit, without scheduling a further check", async () => {
    prismaMock.slaTimer.findUnique.mockResolvedValue({ id: "t1", leadId: "lead1", workspaceId: "ws1", resolvedAt: null, escalatedAt: null });
    prismaMock.lead.findUnique.mockResolvedValue({ id: "lead1", ownerId: "u2" });
    prismaMock.assignment.count.mockResolvedValue(2);
    prismaMock.membership.findFirst.mockResolvedValue({ userId: "manager1" });

    await processSlaCheck("t1");

    expect(prismaMock.slaTimer.update).toHaveBeenCalledWith({ where: { id: "t1" }, data: { escalatedAt: expect.any(Date) } });
    expect(prismaMock.assignment.create).toHaveBeenCalledWith({ data: { leadId: "lead1", userId: "manager1", reassignedFromId: "u2" } });
    expect(enqueueSalespersonAlert).toHaveBeenCalledWith("ws1", "lead1", "manager1", expect.stringContaining("SLA escalation"));
    expect(enqueueSlaCheck).not.toHaveBeenCalled();
  });

  it("falls back to the owner when no manager membership exists", async () => {
    prismaMock.slaTimer.findUnique.mockResolvedValue({ id: "t1", leadId: "lead1", workspaceId: "ws1", resolvedAt: null, escalatedAt: null });
    prismaMock.lead.findUnique.mockResolvedValue({ id: "lead1", ownerId: "u2" });
    prismaMock.assignment.count.mockResolvedValue(2);
    prismaMock.membership.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ userId: "owner1" });

    await processSlaCheck("t1");

    expect(prismaMock.assignment.create).toHaveBeenCalledWith({ data: { leadId: "lead1", userId: "owner1", reassignedFromId: "u2" } });
  });
});

describe("processSalespersonAlert", () => {
  it("sends a WhatsApp text summary to the assigned salesperson's phone", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", phone: "919999999999" });
    prismaMock.lead.findUnique.mockResolvedValue({ id: "lead1", name: "Arun", phone: "918888888888", source: "instagram", score: 30 });
    prismaMock.whatsappNumber.findFirst.mockResolvedValue({ phoneNumberId: "phone_1", accessTokenCipher: "cipher" });

    await processSalespersonAlert("ws1", "lead1", "u1");

    expect(sendWhatsappText).toHaveBeenCalledWith("phone_1", "919999999999", expect.stringContaining("Arun"), "plaintext-token");
  });

  it("skips silently when the salesperson has no phone on file", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", phone: null });

    await processSalespersonAlert("ws1", "lead1", "u1");

    expect(sendWhatsappText).not.toHaveBeenCalled();
  });

  it("skips silently when the workspace has no connected WhatsApp number", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", phone: "919999999999" });
    prismaMock.whatsappNumber.findFirst.mockResolvedValue(null);

    await processSalespersonAlert("ws1", "lead1", "u1");

    expect(sendWhatsappText).not.toHaveBeenCalled();
  });
});
