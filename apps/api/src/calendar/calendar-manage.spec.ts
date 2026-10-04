import { BadRequestException, NotFoundException } from "@nestjs/common";
import { zonedTimeToUtc } from "@zenora/shared";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { encryptToken } from "../common/encryption";
import { appointmentManageKey, parseAppointmentManageKey } from "../common/appointment-token";
import type { WebhooksService } from "../developers/webhooks.service";
import type { NotificationsService } from "../notifications/notifications.service";
import type { PrismaService } from "../prisma/prisma.service";
import type { RoutingEngineService } from "../routing/routing-engine.service";
import { CalendarService } from "./calendar.service";
import type { GoogleCalendarClient } from "./google-calendar.client";

beforeAll(() => {
  process.env.AUTH_SECRET = "test-secret-at-least-16-chars";
  process.env.TOKEN_ENCRYPTION_KEY = "a1".repeat(32);
  process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
});

const TZ = "Asia/Kolkata";
function nextMonday(): string {
  const d = new Date(Date.now() + 10 * 86_400_000);
  while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
const DATE = nextMonday();
const at = (time: string) => zonedTimeToUtc(DATE, time, TZ);

const TYPE = {
  id: "type1",
  workspaceId: "ws1",
  hostUserId: "host1",
  name: "Consultation",
  durationMin: 30,
  bufferMin: 0,
  minNoticeMin: 0,
  active: true,
  availability: [{ day: 1, start: "10:00", end: "11:00" }],
  workspace: { name: "Asha Clinic", timezone: TZ }
};

const APPT = {
  id: "appt1",
  workspaceId: "ws1",
  appointmentTypeId: "type1",
  leadId: "lead1",
  hostUserId: "host1",
  startsAt: new Date(at("10:00")),
  endsAt: new Date(at("10:30")),
  status: "booked",
  guestName: "Ravi",
  guestPhone: "+919812345678",
  googleEventId: null as string | null,
  appointmentType: { name: "Consultation" }
};

function make(appt: Partial<typeof APPT> | null = {}, google: Record<string, unknown> = {}) {
  const client = {
    appointmentType: { findUnique: vi.fn().mockResolvedValue(TYPE) },
    appointment: {
      findFirst: vi.fn().mockResolvedValue(appt ? { ...APPT, ...appt } : null),
      findUnique: vi.fn().mockResolvedValue(appt ? { ...APPT, ...appt } : null),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockImplementation(({ data }: { data: object }) => Promise.resolve({ ...APPT, ...appt, ...data }))
    },
    calendarAccount: { findUnique: vi.fn().mockResolvedValue(null) }
  };
  const g = { accessTokenFor: vi.fn(), freeBusy: vi.fn().mockResolvedValue([]), createEvent: vi.fn(), deleteEvent: vi.fn(), updateEvent: vi.fn(), ...google };
  const notifications = { create: vi.fn().mockResolvedValue({}) };
  const webhooks = { emit: vi.fn().mockResolvedValue(undefined), emitLeadCreated: vi.fn() };
  const service = new CalendarService(
    { client } as unknown as PrismaService,
    g as unknown as GoogleCalendarClient,
    { applyToNewLead: vi.fn() } as unknown as RoutingEngineService,
    notifications as unknown as NotificationsService,
    webhooks as unknown as WebhooksService
  );
  return { service, client, notifications, webhooks, google: g };
}

describe("appointment manage key", () => {
  it("round-trips, and rejects anything tampered with", () => {
    const key = appointmentManageKey("appt1");
    expect(parseAppointmentManageKey(key)).toBe("appt1");
    expect(parseAppointmentManageKey(key.replace("appt1", "appt2"))).toBeNull();
    expect(parseAppointmentManageKey(key.slice(0, -2) + "xx")).toBeNull();
    expect(parseAppointmentManageKey("appt1")).toBeNull();
    expect(parseAppointmentManageKey("")).toBeNull();
    expect(parseAppointmentManageKey(".abc")).toBeNull();
  });
});

describe("cancelling a booking", () => {
  it("marks it cancelled and tells webhook subscribers", async () => {
    const { service, client, webhooks } = make();
    await service.cancelAppointment("ws1", "appt1", "staff");
    expect(client.appointment.update).toHaveBeenCalledWith({ where: { id: "appt1" }, data: { status: "cancelled" } });
    expect(webhooks.emit).toHaveBeenCalledWith("ws1", "appointment.cancelled", expect.objectContaining({ id: "appt1", cancelledBy: "staff" }));
  });

  it("notifies the team only when the guest did it", async () => {
    const staff = make();
    await staff.service.cancelAppointment("ws1", "appt1", "staff");
    expect(staff.notifications.create).not.toHaveBeenCalled();
    const guest = make();
    await guest.service.cancelAppointment("ws1", "appt1", "guest");
    expect(guest.notifications.create).toHaveBeenCalledWith(expect.objectContaining({ type: "appointment_cancelled" }));
  });

  it("removes the Google Calendar event, and still cancels if that fails", async () => {
    const connect = (c: ReturnType<typeof make>) => (c.client.calendarAccount.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ status: "active", refreshTokenCipher: encryptToken("refresh") });
    const ok = make({ googleEventId: "ev1" }, { accessTokenFor: vi.fn().mockResolvedValue("tok") });
    connect(ok);
    await ok.service.cancelAppointment("ws1", "appt1");
    expect(ok.google.deleteEvent).toHaveBeenCalledWith("tok", "ev1");

    const broken = make({ googleEventId: "ev1" }, { accessTokenFor: vi.fn().mockResolvedValue("tok"), deleteEvent: vi.fn().mockRejectedValue(new Error("google down")) });
    connect(broken);
    await expect(broken.service.cancelAppointment("ws1", "appt1")).resolves.toEqual({ ok: true });
    expect(broken.client.appointment.update).toHaveBeenCalled();
  });

  it("refuses an unknown or other-workspace appointment, one already cancelled, and one in the past", async () => {
    await expect(make(null).service.cancelAppointment("ws1", "nope")).rejects.toThrow(NotFoundException);
    await expect(make({ status: "cancelled" }).service.cancelAppointment("ws1", "appt1")).rejects.toThrow(BadRequestException);
    await expect(make({ startsAt: new Date(Date.now() - 3_600_000) }).service.cancelAppointment("ws1", "appt1")).rejects.toThrow(/already taken place/);
  });

  it("looks the appointment up within the caller's workspace", async () => {
    const { service, client } = make();
    await service.cancelAppointment("ws1", "appt1");
    expect(client.appointment.findFirst.mock.calls[0]![0].where).toEqual({ id: "appt1", workspaceId: "ws1" });
  });
});

describe("rescheduling a booking", () => {
  const dto = { date: DATE, startsAt: new Date(at("10:30")).toISOString() };

  it("moves it to a free slot, asks for a fresh reminder, and announces the change", async () => {
    const { service, client, webhooks } = make();
    await service.rescheduleAppointment("ws1", "appt1", dto, "staff");
    const data = client.appointment.update.mock.calls[0]![0].data;
    expect(data.startsAt.getTime()).toBe(at("10:30"));
    expect(data.endsAt.getTime()).toBe(at("11:00"));
    expect(data).toMatchObject({ reminderStatus: null, reminderSentAt: null, reminderError: null });
    expect(webhooks.emit).toHaveBeenCalledWith("ws1", "appointment.rescheduled", expect.objectContaining({ id: "appt1", previousStartsAt: APPT.startsAt.toISOString(), rescheduledBy: "staff" }));
  });

  it("does not count the booking's own slot as busy, but does count everyone else's", async () => {
    const { service, client } = make();
    await service.rescheduleAppointment("ws1", "appt1", dto);
    expect(client.appointment.findMany.mock.calls[0]![0].where.id).toEqual({ not: "appt1" });
  });

  it("refuses a time that is not available", async () => {
    const { service } = make();
    await expect(service.rescheduleAppointment("ws1", "appt1", { date: DATE, startsAt: new Date(at("12:00")).toISOString() })).rejects.toThrow(/no longer available/);
  });

  it("moves the Google Calendar event too", async () => {
    const c = make({ googleEventId: "ev1" }, { accessTokenFor: vi.fn().mockResolvedValue("tok") });
    (c.client.calendarAccount.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ status: "active", refreshTokenCipher: encryptToken("refresh") });
    await c.service.rescheduleAppointment("ws1", "appt1", dto);
    expect(c.google.updateEvent).toHaveBeenCalledWith("tok", "ev1", { startsAt: new Date(at("10:30")), endsAt: new Date(at("11:00")) });
  });

  it("offers staff the free times for a booking, ignoring its own slot", async () => {
    const { service, client } = make();
    const { slots } = await service.appointmentSlots("ws1", "appt1", DATE);
    expect(slots).toEqual([at("10:00"), at("10:30")]);
    expect(client.appointment.findMany.mock.calls[0]![0].where.id).toEqual({ not: "appt1" });
  });

  it("refuses when the booking page is switched off", async () => {
    const { service, client } = make();
    client.appointmentType.findUnique.mockResolvedValue({ ...TYPE, active: false });
    await expect(service.rescheduleAppointment("ws1", "appt1", dto)).rejects.toThrow(NotFoundException);
  });

  it("notifies the team only when the guest moved it", async () => {
    const guest = make();
    await guest.service.rescheduleAppointment("ws1", "appt1", dto, "guest");
    expect(guest.notifications.create).toHaveBeenCalledWith(expect.objectContaining({ type: "appointment_rescheduled" }));
  });
});

describe("the guest's private link", () => {
  it("rejects a forged key without touching the database", async () => {
    const { service, client } = make();
    await expect(service.manageView("appt1.forged", "1.1.1.1")).rejects.toThrow(NotFoundException);
    expect(client.appointment.findUnique).not.toHaveBeenCalled();
  });

  it("shows the booking, and whether it can still be changed", async () => {
    const { service } = make();
    expect(await service.manageView(appointmentManageKey("appt1"), "1.1.1.1")).toMatchObject({ name: "Consultation", businessName: "Asha Clinic", status: "booked", canChange: true, canReschedule: true });
    const cancelled = make({ status: "cancelled" });
    expect(await cancelled.service.manageView(appointmentManageKey("appt1"), "1.1.1.1")).toMatchObject({ canChange: false });
  });

  it("cancels and reschedules through the key, as the guest", async () => {
    const { service, webhooks } = make();
    await service.manageCancel(appointmentManageKey("appt1"), "1.1.1.1");
    expect(webhooks.emit).toHaveBeenCalledWith("ws1", "appointment.cancelled", expect.objectContaining({ cancelledBy: "guest" }));
    await service.manageReschedule(appointmentManageKey("appt1"), "1.1.1.1", { date: DATE, startsAt: new Date(at("10:30")).toISOString() });
    expect(webhooks.emit).toHaveBeenCalledWith("ws1", "appointment.rescheduled", expect.objectContaining({ rescheduledBy: "guest" }));
  });

  it("is rate limited per address", async () => {
    const { service } = make();
    const key = appointmentManageKey("appt1");
    for (let i = 0; i < 20; i++) await service.manageView(key, "9.9.9.9");
    await expect(service.manageView(key, "9.9.9.9")).rejects.toThrow();
    await expect(service.manageView(key, "8.8.8.8")).resolves.toBeDefined();
  });
});
