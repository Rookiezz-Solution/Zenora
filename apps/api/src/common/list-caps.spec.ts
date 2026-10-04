import { describe, expect, it, vi } from "vitest";
import type { AuditService } from "../audit/audit.service";
import type { PrismaService } from "../prisma/prisma.service";
import { BroadcastsService } from "../broadcasts/broadcasts.service";
import { LeadsService } from "../leads/leads.service";
import { TasksService } from "../tasks/tasks.service";

// Lists that grow with the customer's data must never read an unbounded number
// of rows in one request.
describe("list endpoints are bounded", () => {
  it("caps the task list", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    await new TasksService({ client: { task: { findMany } } } as unknown as PrismaService).list("ws1", {} as never);
    expect(findMany.mock.calls[0]![0].take).toBe(500);
  });

  it("caps the broadcast list, newest first", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const service = new BroadcastsService({ client: { broadcast: { findMany } } } as unknown as PrismaService, {} as AuditService, {} as never, {} as never, {} as never);
    await service.list("ws1");
    expect(findMany.mock.calls[0]![0]).toMatchObject({ take: 200, orderBy: { createdAt: "desc" } });
  });

  it("caps each part of a lead's timeline, newest first, and still merges them in order", async () => {
    const note = vi.fn().mockResolvedValue([{ id: "n1", createdAt: new Date("2026-10-01") }]);
    const message = vi.fn().mockResolvedValue([{ id: "m1", createdAt: new Date("2026-10-03") }]);
    const task = vi.fn().mockResolvedValue([{ id: "t1", createdAt: new Date("2026-10-02") }]);
    const client = { lead: { findFirst: vi.fn().mockResolvedValue({ id: "lead1" }) }, note: { findMany: note }, message: { findMany: message }, task: { findMany: task } };
    const service = new LeadsService({ client } as unknown as PrismaService, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never);
    const events = await service.getTimeline("ws1", "lead1");
    for (const call of [note, message, task]) expect(call.mock.calls[0]![0]).toMatchObject({ take: 500, orderBy: { createdAt: "desc" } });
    expect(events.map((e) => e.type)).toEqual(["message", "task", "note"]);
  });
});
