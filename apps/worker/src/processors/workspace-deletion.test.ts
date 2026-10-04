import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  workspace: { findUnique: vi.fn(), findMany: vi.fn(), delete: vi.fn() },
  invoice: { findMany: vi.fn() },
  retainedInvoice: { createMany: vi.fn() },
  whatsappNumber: { findMany: vi.fn() },
  instagramAccount: { findMany: vi.fn() },
  message: { deleteMany: vi.fn() },
  conversation: { deleteMany: vi.fn() },
  task: { deleteMany: vi.fn() },
  slaTimer: { deleteMany: vi.fn() },
  platformAuditLog: { deleteMany: vi.fn() },
  $executeRaw: vi.fn()
}));
vi.mock("@zenora/db", () => ({ prisma: prismaMock, Prisma: { sql: (s: TemplateStringsArray) => s.join("?") } }));

import { processWorkspaceDeletions, purgeWorkspace } from "./workspace-deletion";

const now = new Date("2026-10-20T00:00:00Z");
const order: string[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  order.length = 0;
  prismaMock.workspace.findUnique.mockResolvedValue({ name: "Asha Clinic", billingName: "Asha Clinic Pvt Ltd", gstin: "27ABCDE1234F1Z5", billingAddress: "Pune" });
  prismaMock.invoice.findMany.mockResolvedValue([{ id: "inv1", description: "Starter plan", amountInr: 1499, gstInr: 270, status: "paid", razorpayOrderId: "o1", razorpayPaymentId: "p1", periodStart: new Date("2026-03-01"), periodEnd: new Date("2026-04-01"), issuedAt: new Date("2026-03-01T00:00:00Z") }]);
  prismaMock.whatsappNumber.findMany.mockResolvedValue([{ phoneNumberId: "109876543210" }]);
  prismaMock.instagramAccount.findMany.mockResolvedValue([]);
  prismaMock.message.deleteMany.mockImplementation(() => { order.push("messages"); return Promise.resolve({ count: 12 }); });
  prismaMock.retainedInvoice.createMany.mockImplementation(() => { order.push("retain"); return Promise.resolve({ count: 1 }); });
  prismaMock.workspace.delete.mockImplementation(() => { order.push("delete"); return Promise.resolve({}); });
});

describe("purgeWorkspace", () => {
  it("copies invoices aside, with the business's billing details and an 8-year retention, before anything is deleted", async () => {
    await purgeWorkspace("ws1", now);

    const call = prismaMock.retainedInvoice.createMany.mock.calls[0]![0];
    expect(call.skipDuplicates).toBe(true);
    expect(call.data[0]).toMatchObject({ originalInvoiceId: "inv1", formerWorkspaceId: "ws1", businessName: "Asha Clinic Pvt Ltd", gstin: "27ABCDE1234F1Z5", amountInr: 1499, gstInr: 270, retainUntil: new Date("2034-03-01T00:00:00Z") });
    expect(order.indexOf("retain")).toBeLessThan(order.indexOf("messages"));
    expect(order.indexOf("messages")).toBeLessThan(order.indexOf("delete"));
  });

  it("holds only billing details in the retained copy, never contacts or messages", async () => {
    await purgeWorkspace("ws1", now);
    const keys = Object.keys(prismaMock.retainedInvoice.createMany.mock.calls[0]![0].data[0]);
    expect(keys.sort()).toEqual(["amountInr", "billingAddress", "businessName", "deletedAt", "description", "formerWorkspaceId", "gstin", "gstInr", "issuedAt", "originalInvoiceId", "periodEnd", "periodStart", "razorpayOrderId", "razorpayPaymentId", "retainUntil", "status"].sort());
  });

  it("removes raw channel payloads for the workspace's own numbers, the heavy tables, its audit rows, then the workspace", async () => {
    const result = await purgeWorkspace("ws1", now);

    expect(prismaMock.$executeRaw).toHaveBeenCalledTimes(1);
    expect(prismaMock.conversation.deleteMany).toHaveBeenCalledWith({ where: { workspaceId: "ws1" } });
    expect(prismaMock.platformAuditLog.deleteMany).toHaveBeenCalledWith({ where: { workspaceId: "ws1" } });
    expect(prismaMock.workspace.delete).toHaveBeenCalledWith({ where: { id: "ws1" } });
    expect(result).toEqual({ invoicesRetained: 1, messages: 12 });
  });

  it("skips the payload cleanup when the workspace never connected a channel, and does nothing for a workspace already gone", async () => {
    prismaMock.whatsappNumber.findMany.mockResolvedValue([]);
    await purgeWorkspace("ws1", now);
    expect(prismaMock.$executeRaw).not.toHaveBeenCalled();

    prismaMock.workspace.findUnique.mockResolvedValue(null);
    prismaMock.workspace.delete.mockClear();
    await purgeWorkspace("gone", now);
    expect(prismaMock.workspace.delete).not.toHaveBeenCalled();
  });

  it("does not retain anything for a workspace with no invoices", async () => {
    prismaMock.invoice.findMany.mockResolvedValue([]);
    await purgeWorkspace("ws1", now);
    expect(prismaMock.retainedInvoice.createMany).not.toHaveBeenCalled();
  });
});

describe("processWorkspaceDeletions", () => {
  it("deletes only workspaces whose grace period has passed", async () => {
    prismaMock.workspace.findMany.mockResolvedValue([{ id: "ws1" }]);
    const result = await processWorkspaceDeletions(now);
    expect(prismaMock.workspace.findMany).toHaveBeenCalledWith({ where: { deletionScheduledAt: { lte: now } }, select: { id: true } });
    expect(result).toEqual({ deleted: 1, failed: 0 });
  });

  it("leaves a failing workspace scheduled for the next run and carries on with the others", async () => {
    prismaMock.workspace.findMany.mockResolvedValue([{ id: "bad" }, { id: "ws1" }]);
    prismaMock.workspace.findUnique.mockRejectedValueOnce(new Error("db hiccup"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await processWorkspaceDeletions(now);
    expect(result).toEqual({ deleted: 1, failed: 1 });
  });
});
