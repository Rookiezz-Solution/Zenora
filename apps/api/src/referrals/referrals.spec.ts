import { BadRequestException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../prisma/prisma.service";
import { ReferralsService } from "./referrals.service";

function make(client: Record<string, unknown> = {}) {
  const tx = {
    payout: { create: vi.fn().mockResolvedValue({ id: "po1" }) },
    commissionEntry: { updateMany: vi.fn().mockResolvedValue({ count: 2 }) },
    platformAuditLog: { create: vi.fn() }
  };
  const full = {
    referralCode: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn().mockImplementation(({ data }) => Promise.resolve(data)) },
    referral: { findUnique: vi.fn(), create: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
    workspace: { findUnique: vi.fn().mockResolvedValue({ name: "Asha Clinic" }) },
    invoice: { findUnique: vi.fn() },
    membership: { findUnique: vi.fn().mockResolvedValue(null) },
    commissionEntry: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
    payout: { findMany: vi.fn().mockResolvedValue([]) },
    user: { findMany: vi.fn().mockResolvedValue([]) },
    $transaction: vi.fn().mockImplementation((fn: (t: typeof tx) => unknown) => fn(tx)),
    ...client
  };
  return { service: new ReferralsService({ client: full } as unknown as PrismaService), client: full, tx };
}

describe("ReferralsService.myCode", () => {
  it("creates an 8-character code once and returns the same one afterwards", async () => {
    const { service, client } = make();
    const code = await service.myCode("u1");
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);

    (client.referralCode.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ code: "ABCD2345" });
    await expect(service.myCode("u1")).resolves.toBe("ABCD2345");
  });
});

describe("ReferralsService.attribute", () => {
  it("records a referral for a valid code of somebody else", async () => {
    const { service, client } = make({ referralCode: { findUnique: vi.fn().mockResolvedValue({ userId: "referrer" }) } });
    await service.attribute("ws1", "creator", "abcd2345");
    expect(client.referral.create).toHaveBeenCalledWith({ data: { referrerUserId: "referrer", referredWorkspaceId: "ws1", referredName: "Asha Clinic", code: "ABCD2345" } });
  });

  it("silently ignores missing, malformed, unknown and self-owned codes", async () => {
    const unknown = make();
    await unknown.service.attribute("ws1", "creator", undefined);
    await unknown.service.attribute("ws1", "creator", "nope");
    await unknown.service.attribute("ws1", "creator", "ABCD2345");
    expect(unknown.client.referral.create).not.toHaveBeenCalled();

    const own = make({ referralCode: { findUnique: vi.fn().mockResolvedValue({ userId: "creator" }) } });
    await own.service.attribute("ws1", "creator", "ABCD2345");
    expect(own.client.referral.create).not.toHaveBeenCalled();
  });

  it("never throws into workspace creation", async () => {
    const { service } = make({ referralCode: { findUnique: vi.fn().mockRejectedValue(new Error("db down")) } });
    await expect(service.attribute("ws1", "creator", "ABCD2345")).resolves.toBeUndefined();
  });
});

describe("ReferralsService.accrueForPayment", () => {
  const invoice = { id: "inv1", workspaceId: "ws1", status: "paid", amountInr: 1499, issuedAt: new Date("2026-03-01T00:00:00Z") };
  const referral = { id: "ref1", referrerUserId: "referrer", referredWorkspaceId: "ws1", createdAt: new Date("2026-01-15T00:00:00Z") };
  const base = { invoice: { findUnique: vi.fn().mockResolvedValue(invoice) }, referral: { findUnique: vi.fn().mockResolvedValue(referral) } };

  it("accrues 20% of the pre-GST amount on a paid invoice of a referred workspace", async () => {
    const { service, client } = make(base);
    await service.accrueForPayment("pay1");
    expect(client.commissionEntry.create).toHaveBeenCalledWith({ data: { referralId: "ref1", invoiceId: "inv1", baseInr: 1499, pct: 20, amountInr: 300 } });
  });

  it("does nothing for an unreferred workspace, an unpaid invoice, or one outside the 12-month window", async () => {
    const unreferred = make({ ...base, referral: { findUnique: vi.fn().mockResolvedValue(null) } });
    await unreferred.service.accrueForPayment("pay1");
    const unpaid = make({ ...base, invoice: { findUnique: vi.fn().mockResolvedValue({ ...invoice, status: "failed" }) } });
    await unpaid.service.accrueForPayment("pay1");
    const late = make({ ...base, invoice: { findUnique: vi.fn().mockResolvedValue({ ...invoice, issuedAt: new Date("2027-02-01T00:00:00Z") }) } });
    await late.service.accrueForPayment("pay1");
    for (const t of [unreferred, unpaid, late]) expect(t.client.commissionEntry.create).not.toHaveBeenCalled();
  });

  it("never earns on a workspace the referrer belongs to, and never twice for one invoice", async () => {
    const member = make({ ...base, membership: { findUnique: vi.fn().mockResolvedValue({ id: "m" }) } });
    await member.service.accrueForPayment("pay1");
    expect(member.client.commissionEntry.create).not.toHaveBeenCalled();

    const twice = make({ ...base, commissionEntry: { findUnique: vi.fn().mockResolvedValue({ id: "c" }), create: vi.fn() } });
    await twice.service.accrueForPayment("pay1");
    expect(twice.client.commissionEntry.create).not.toHaveBeenCalled();
  });

  it("earns nothing more once the referred workspace has been deleted", async () => {
    const { service, client } = make({ ...base, referral: { findUnique: vi.fn().mockResolvedValue({ ...referral, referredWorkspaceId: null }) } });
    await service.accrueForPayment("pay1");
    expect(client.commissionEntry.create).not.toHaveBeenCalled();
  });

  it("never fails the payment it is attached to", async () => {
    const { service } = make({ invoice: { findUnique: vi.fn().mockRejectedValue(new Error("db down")) } });
    await expect(service.accrueForPayment("pay1")).resolves.toBeUndefined();
  });
});

describe("ReferralsService payouts", () => {
  it("totals what is owed per referrer", async () => {
    const { service } = make({
      commissionEntry: {
        findMany: vi.fn().mockResolvedValue([
          { amountInr: 300, referral: { referrerUserId: "a" } },
          { amountInr: 800, referral: { referrerUserId: "a" } },
          { amountInr: 200, referral: { referrerUserId: "b" } }
        ])
      },
      user: { findMany: vi.fn().mockResolvedValue([{ id: "a", email: "a@x.co", name: "A" }, { id: "b", email: "b@x.co", name: null }]) }
    });
    const result = await service.owed();
    expect(result.owed.map((o) => [o.userId, o.amountInr, o.entries])).toEqual([["a", 1100, 2], ["b", 200, 1]]);
  });

  it("records a payout for exactly the commissions owed, in one transaction, and audits it", async () => {
    const { service, tx } = make({ commissionEntry: { findMany: vi.fn().mockResolvedValue([{ id: "c1", amountInr: 300 }, { id: "c2", amountInr: 800 }]) } });
    await service.recordPayout("admin1", "referrer", "UTR123456", "INV-9");

    expect(tx.payout.create).toHaveBeenCalledWith({ data: { referrerUserId: "referrer", amountInr: 1100, reference: "UTR123456", partnerInvoiceRef: "INV-9", paidById: "admin1" } });
    expect(tx.commissionEntry.updateMany).toHaveBeenCalledWith({ where: { id: { in: ["c1", "c2"] }, status: "accrued" }, data: { status: "paid", payoutId: "po1" } });
    expect(tx.platformAuditLog.create.mock.calls[0]![0].data).toMatchObject({ action: "payout.recorded" });
  });

  it("refuses when nothing is owed, and rolls back if commissions changed underneath it", async () => {
    await expect(make().service.recordPayout("admin1", "referrer", "UTR1")).rejects.toThrow(NotFoundException);

    const { service, tx } = make({ commissionEntry: { findMany: vi.fn().mockResolvedValue([{ id: "c1", amountInr: 300 }, { id: "c2", amountInr: 800 }]) } });
    tx.commissionEntry.updateMany.mockResolvedValue({ count: 1 });
    await expect(service.recordPayout("admin1", "referrer", "UTR1")).rejects.toThrow(BadRequestException);
  });
});

describe("ReferralsService.overview", () => {
  it("shows the code, terms, earnings and referred businesses by name and plan only", async () => {
    const { service } = make({
      referralCode: { findUnique: vi.fn().mockResolvedValue({ code: "ABCD2345" }) },
      referral: { findMany: vi.fn().mockResolvedValue([{ id: "r1", createdAt: new Date("2026-02-01"), referredName: "Asha Clinic", referredWorkspace: { name: "Asha Clinic", subscription: { planId: "starter", status: "active" } } }, { id: "r2", createdAt: new Date("2026-03-01"), referredName: "Gone Salon", referredWorkspace: null }]) },
      commissionEntry: { findMany: vi.fn().mockResolvedValue([{ referralId: "r1", amountInr: 300, status: "paid" }, { referralId: "r1", amountInr: 300, status: "accrued" }]) }
    });
    const o = await service.overview("u1");
    expect(o).toMatchObject({ code: "ABCD2345", terms: { pct: 20, months: 12 }, accruedInr: 300, paidInr: 300 });
    expect(o.referrals).toEqual([
      { id: "r1", joinedAt: expect.any(Date), businessName: "Asha Clinic", planId: "starter", status: "active", earnedInr: 600 },
      { id: "r2", joinedAt: expect.any(Date), businessName: "Gone Salon", planId: "closed", status: "closed", earnedInr: 0 } // deleted workspace: name kept, earnings stay
    ]);
  });
});
