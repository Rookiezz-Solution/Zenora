import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  appointment: { findMany: vi.fn(), update: vi.fn() },
  waTemplate: { findFirst: vi.fn() },
  whatsappNumber: { findFirst: vi.fn() },
  conversation: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
  message: { create: vi.fn() }
}));
vi.mock("@zenora/db", () => ({ prisma: prismaMock }));
vi.mock("../realtime", () => ({ publishInboxEvent: vi.fn() }));
vi.mock("../decrypt-token", () => ({ decryptToken: (v: string) => `dec(${v})` }));
const sendWhatsappTemplate = vi.hoisted(() => vi.fn());
vi.mock("../meta-send", () => ({ sendWhatsappTemplate }));

import { processReminderSweep } from "./reminders";

const HOUR = 3_600_000;
const now = new Date("2026-10-06T00:00:00Z");

function appointment(overrides: Record<string, unknown> = {}) {
  return {
    id: "ap1",
    workspaceId: "ws1",
    leadId: "lead1",
    guestName: "Asha",
    guestPhone: "919000000001",
    startsAt: new Date(now.getTime() + 20 * HOUR),
    createdAt: new Date(now.getTime() - 48 * HOUR),
    appointmentType: { name: "Consultation", reminderHoursBefore: 24, reminderTemplateId: "t1" },
    workspace: { timezone: "Asia/Kolkata" },
    ...overrides
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.appointment.findMany.mockResolvedValue([appointment()]);
  prismaMock.waTemplate.findFirst.mockResolvedValue({ name: "appt_reminder", language: "en", metaStatus: "approved", bodyText: "Hi {{1}}, {{3}} on {{2}}" });
  prismaMock.whatsappNumber.findFirst.mockResolvedValue({ phoneNumberId: "pn1", accessTokenCipher: "cipher" });
  prismaMock.conversation.findFirst.mockResolvedValue(null);
  prismaMock.conversation.create.mockResolvedValue({ id: "conv1" });
  prismaMock.message.create.mockResolvedValue({ id: "m1" });
  sendWhatsappTemplate.mockResolvedValue("wamid.1");
});

describe("processReminderSweep", () => {
  it("sends the approved template with the guest's name, time and service, then marks it sent", async () => {
    const result = await processReminderSweep(now);

    expect(result).toEqual({ sent: 1, failed: 0 });
    const args = sendWhatsappTemplate.mock.calls[0]!;
    expect(args.slice(0, 5)).toEqual(["pn1", "919000000001", "appt_reminder", "en", "dec(cipher)"]);
    expect(args[5][0]).toBe("Asha");
    expect(args[5][2]).toBe("Consultation");
    expect(prismaMock.appointment.update.mock.calls[0]![0].data).toMatchObject({ reminderStatus: "sent", reminderError: null });
    expect(prismaMock.message.create).toHaveBeenCalled(); // visible in the inbox thread
  });

  it("does not remind before the window opens", async () => {
    prismaMock.appointment.findMany.mockResolvedValue([appointment({ startsAt: new Date(now.getTime() + 30 * HOUR) })]);
    expect(await processReminderSweep(now)).toEqual({ sent: 0, failed: 0 });
    expect(sendWhatsappTemplate).not.toHaveBeenCalled();
  });

  it("does not remind for a booking made inside the window", async () => {
    prismaMock.appointment.findMany.mockResolvedValue([appointment({ createdAt: new Date(now.getTime() - HOUR) })]);
    expect(await processReminderSweep(now)).toEqual({ sent: 0, failed: 0 });
  });

  it("marks the reminder failed (and never retries) when the template isn't approved", async () => {
    prismaMock.waTemplate.findFirst.mockResolvedValue({ name: "appt_reminder", language: "en", metaStatus: "pending", bodyText: "x" });
    const result = await processReminderSweep(now);

    expect(result).toEqual({ sent: 0, failed: 1 });
    expect(sendWhatsappTemplate).not.toHaveBeenCalled();
    expect(prismaMock.appointment.update.mock.calls[0]![0].data).toMatchObject({ reminderStatus: "failed" });
  });

  it("records a Meta send failure without stopping the rest of the sweep", async () => {
    prismaMock.appointment.findMany.mockResolvedValue([appointment({ id: "ap1" }), appointment({ id: "ap2" })]);
    sendWhatsappTemplate.mockRejectedValueOnce(new Error("Meta Graph API error")).mockResolvedValueOnce("wamid.2");

    const result = await processReminderSweep(now);

    expect(result).toEqual({ sent: 1, failed: 1 });
    expect(prismaMock.appointment.update.mock.calls[0]![0]).toMatchObject({ where: { id: "ap1" }, data: { reminderStatus: "failed", reminderError: "Meta Graph API error" } });
  });

  it("fails clearly when no WhatsApp number is connected", async () => {
    prismaMock.whatsappNumber.findFirst.mockResolvedValue(null);
    await processReminderSweep(now);
    expect(prismaMock.appointment.update.mock.calls[0]![0].data.reminderError).toContain("No WhatsApp number");
  });
});
