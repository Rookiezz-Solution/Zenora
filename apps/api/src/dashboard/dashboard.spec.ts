import { describe, expect, it, vi } from "vitest";
import type { UsageService } from "../billing/usage.service";
import type { PrismaService } from "../prisma/prisma.service";
import { DashboardService } from "./dashboard.service";

const at = (iso: string) => new Date(`2026-10-01T${iso}:00Z`);

const earlier = new Date(Date.now() - 3_600_000);
const nextWeek = new Date(Date.now() + 5 * 86_400_000);
// 4 overdue, 20 due next week, 1 with no due date.
const tasks = [...Array.from({ length: 4 }, () => ({ dueAt: earlier })), { dueAt: nextWeek }, ...Array.from({ length: 15 }, () => ({ dueAt: nextWeek })), { dueAt: null }];

function make(overrides: Record<string, unknown> = {}) {
  const client = {
    lead: { count: vi.fn().mockResolvedValueOnce(12).mockResolvedValueOnce(8).mockResolvedValue(3), groupBy: vi.fn().mockImplementation(({ by }: { by: string[] }) => Promise.resolve(by[0] === "source" ? [{ source: "whatsapp", _count: { _all: 9 } }, { source: null, _count: { _all: 3 } }] : [{ stageId: "s1", _count: { _all: 5 } }])) },
    conversation: {
      findMany: vi.fn().mockResolvedValueOnce([
        { messages: [{ direction: "inbound", createdAt: at("10:00") }, { direction: "outbound", createdAt: at("10:06") }] },
        { messages: [{ direction: "inbound", createdAt: at("10:00") }, { direction: "outbound", createdAt: at("10:20") }] },
        { messages: [{ direction: "inbound", createdAt: at("10:00") }] }
      ]).mockResolvedValueOnce([
        { messages: [{ direction: "inbound", createdAt: at("11:00") }] },
        { messages: [{ direction: "outbound", createdAt: at("11:00") }] },
        { messages: [] }
      ])
    },
    task: { findMany: vi.fn().mockResolvedValue(tasks) },
    appointment: { findMany: vi.fn().mockResolvedValue(Array.from({ length: 6 }, (_, i) => ({ id: "a" + i, startsAt: at("12:00"), guestName: i === 0 ? "Asha" : "G" + i, appointmentType: { name: "Consult" } }))) },
    stage: { findMany: vi.fn().mockResolvedValue([{ id: "s1", name: "New", type: "open" }, { id: "s2", name: "Won", type: "won" }]) },
    broadcast: { aggregate: vi.fn().mockResolvedValue({ _sum: { costEstimate: 25_800 }, _count: { _all: 2 } }) },
    ...overrides
  };
  const usage = { aiCreditsSummary: vi.fn().mockResolvedValue({ remaining: 640, monthly: 1000 }) };
  return { service: new DashboardService({ client } as unknown as PrismaService, usage as unknown as UsageService), client };
}

describe("DashboardService.summary", () => {
  it("compares new leads with the previous period of the same length", async () => {
    const { service } = make();
    const s = await service.summary("ws1", 7);
    expect(s.newLeads).toEqual({ current: 12, previous: 8, changePct: 50 });
    expect(s.days).toBe(7);
  });

  it("reports the median first-reply time over answered threads, and how many are waiting", async () => {
    const s = await make().service.summary("ws1", 7);
    expect(s.speedToLeadMinutes).toBe(13); // 6 and 20 minutes -> median 13; the unanswered thread is left out
    expect(s.waitingForReply).toBe(1); // only the thread whose last message is from the customer
  });

  it("counts open, overdue and due-today tasks, and upcoming bookings", async () => {
    const s = await make().service.summary("ws1", 7);
    expect(s.tasks).toEqual({ open: 21, overdue: 4, dueToday: 0 }); // the task without a due date is open but neither overdue nor due
    expect(s.appointments.next7Days).toBe(6);
    expect(s.appointments.upcoming).toHaveLength(5); // shows the next five
    expect(s.appointments.upcoming[0]).toMatchObject({ guestName: "Asha" });
  });

  it("lists sources by size (unknown when blank), a pipeline snapshot with zero-lead stages, and WhatsApp spend in rupees", async () => {
    const s = await make().service.summary("ws1", 30);
    expect(s.sources).toEqual([{ source: "whatsapp", leads: 9 }, { source: "unknown", leads: 3 }]);
    expect(s.pipeline).toEqual([{ id: "s1", name: "New", type: "open", leads: 5 }, { id: "s2", name: "Won", type: "won", leads: 0 }]);
    expect(s.whatsappSpendInr).toBe(258);
    expect(s.broadcastsSent).toBe(2);
    expect(s.aiCredits).toEqual({ remaining: 640, monthly: 1000 });
  });

  it("scopes every query to the workspace and excludes merged duplicates", async () => {
    const { service, client } = make();
    await service.summary("ws1", 7);
    for (const call of client.lead.count.mock.calls) expect(call[0].where).toMatchObject({ workspaceId: "ws1", mergedIntoId: null });
    expect(client.conversation.findMany.mock.calls.every((c: unknown[]) => (c[0] as { where: { workspaceId: string } }).where.workspaceId === "ws1")).toBe(true);
    expect(client.task.findMany.mock.calls.every((c: unknown[]) => (c[0] as { where: { workspaceId: string } }).where.workspaceId === "ws1")).toBe(true);
  });

  it("copes with an empty workspace", async () => {
    const empty = {
      lead: { count: vi.fn().mockResolvedValue(0), groupBy: vi.fn().mockResolvedValue([]) },
      conversation: { findMany: vi.fn().mockResolvedValue([]) },
      task: { findMany: vi.fn().mockResolvedValue([]) },
      appointment: { findMany: vi.fn().mockResolvedValue([]) },
      stage: { findMany: vi.fn().mockResolvedValue([]) },
      broadcast: { aggregate: vi.fn().mockResolvedValue({ _sum: { costEstimate: null }, _count: { _all: 0 } }) }
    };
    const s = await make(empty).service.summary("ws1", 7);
    expect(s).toMatchObject({ newLeads: { current: 0, previous: 0, changePct: null }, speedToLeadMinutes: null, waitingForReply: 0, whatsappSpendInr: 0, sources: [], pipeline: [] });
  });
});
