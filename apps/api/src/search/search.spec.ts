import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../prisma/prisma.service";
import { SearchService, excerpt } from "./search.service";

function make() {
  const client = {
    lead: { findMany: vi.fn().mockResolvedValue([{ id: "l1", name: "Asha", phone: "919876543210", email: null }]) },
    automation: { findMany: vi.fn().mockResolvedValue([]) },
    flowTemplate: { findMany: vi.fn().mockResolvedValue([]) },
    task: { findMany: vi.fn().mockResolvedValue([]) },
    note: { findMany: vi.fn().mockResolvedValue([{ id: "n1", body: "Asked about the weekend batch pricing and discounts for two", leadId: "l1", lead: { name: "Asha" } }]) }
  };
  return { service: new SearchService({ client } as unknown as PrismaService), client };
}

describe("SearchService", () => {
  it("does nothing for a query shorter than two characters", async () => {
    const { service, client } = make();
    expect(await service.search("ws1", " a ")).toMatchObject({ leads: [], tasks: [], notes: [] });
    expect(client.lead.findMany).not.toHaveBeenCalled();
  });

  it("keeps every search inside the workspace and out of merged duplicates", async () => {
    const { service, client } = make();
    await service.search("ws1", "asha");
    expect(client.lead.findMany.mock.calls[0]![0].where).toMatchObject({ workspaceId: "ws1", mergedIntoId: null });
    expect(client.automation.findMany.mock.calls[0]![0].where).toMatchObject({ workspaceId: "ws1" });
    expect(client.flowTemplate.findMany.mock.calls[0]![0].where).toMatchObject({ workspaceId: "ws1" });
    expect(client.task.findMany.mock.calls[0]![0].where).toMatchObject({ workspaceId: "ws1" });
    expect(client.note.findMany.mock.calls[0]![0].where.lead).toMatchObject({ workspaceId: "ws1" });
  });

  it("matches phone numbers by their digits however they are typed, but only from three digits up", async () => {
    const { service, client } = make();
    await service.search("ws1", "+91 98765");
    expect(client.lead.findMany.mock.calls[0]![0].where.OR).toContainEqual({ phone: { contains: "9198765" } });
    await service.search("ws1", "ab");
    expect(client.lead.findMany.mock.calls[1]![0].where.OR.some((c: { phone?: unknown }) => c.phone)).toBe(false);
  });

  it("limits each group and returns a short excerpt of a matching note", async () => {
    const { service, client } = make();
    const result = await service.search("ws1", "weekend");
    expect(client.lead.findMany.mock.calls[0]![0].take).toBe(5);
    expect(result.notes[0]).toEqual({ id: "n1", leadId: "l1", leadName: "Asha", excerpt: "Asked about the weekend batch pricing and discounts for two" });
  });
});

describe("excerpt", () => {
  it("shows context around the match, with ellipses where text was cut", () => {
    const text = "x".repeat(100) + " budget is 50k " + "y".repeat(100);
    const e = excerpt(text, "budget");
    expect(e.startsWith("…")).toBe(true);
    expect(e.endsWith("…")).toBe(true);
    expect(e).toContain("budget is 50k");
    expect(e.length).toBeLessThan(110);
  });
  it("falls back to the start of the text when nothing matches (e.g. a tag search)", () => {
    expect(excerpt("short note", "zzz")).toBe("short note");
  });
});
