import { BadRequestException, HttpException, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { zonedTimeToUtc } from "@zenora/shared";
import { describe, expect, it, vi } from "vitest";
import type { NotificationsService } from "../notifications/notifications.service";
import type { PrismaService } from "../prisma/prisma.service";
import type { RoutingEngineService } from "../routing/routing-engine.service";
import { CalendarService } from "./calendar.service";
import type { GoogleCalendarClient } from "./google-calendar.client";

const TZ = "Asia/Kolkata";

// A date comfortably in the future that falls on a Monday, so a Monday
// window always applies.
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

function make(overrides: { client?: Record<string, unknown>; google?: Partial<Record<keyof GoogleCalendarClient, unknown>> } = {}) {
  const client = {
    appointmentType: { findUnique: vi.fn().mockResolvedValue(TYPE) },
    appointment: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: "appt1" }),
      update: vi.fn()
    },
    calendarAccount: { findUnique: vi.fn().mockResolvedValue(null), upsert: vi.fn(), deleteMany: vi.fn() },
    lead: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: "lead1" }) },
    consent: { create: vi.fn() },
    membership: { findUnique: vi.fn().mockResolvedValue({ id: "m1" }) },
    ...overrides.client
  };
  const google = { accessTokenFor: vi.fn(), freeBusy: vi.fn().mockResolvedValue([]), createEvent: vi.fn(), exchangeCode: vi.fn(), ...overrides.google };
  const routing = { applyToNewLead: vi.fn() };
  const notifications = { create: vi.fn().mockResolvedValue({}) };
  const service = new CalendarService(
    { client } as unknown as PrismaService,
    google as unknown as GoogleCalendarClient,
    routing as unknown as RoutingEngineService,
    notifications as unknown as NotificationsService
  );
  return { service, client, google, routing, notifications };
}

const guest = { date: DATE, startsAt: new Date(at("10:00")).toISOString(), name: "Ravi", phone: "+91 98123 45678", consent: true as const };

describe("CalendarService public booking", () => {
  it("hides inactive or missing booking pages", async () => {
    const { service } = make({ client: { appointmentType: { findUnique: vi.fn().mockResolvedValue({ ...TYPE, active: false }) } } });
    await expect(service.getPublicType("type1")).rejects.toThrow(NotFoundException);
  });

  it("offers slots inside the availability window", async () => {
    const { service } = make();
    const { slots } = await service.getSlots("type1", DATE);
    expect(slots).toEqual([at("10:00"), at("10:30")]);
  });

  it("removes a slot already booked for the host", async () => {
    const { service } = make({
      client: { appointment: { findMany: vi.fn().mockResolvedValue([{ startsAt: new Date(at("10:00")), endsAt: new Date(at("10:30")) }]) } }
    });
    const { slots } = await service.getSlots("type1", DATE);
    expect(slots).toEqual([at("10:30")]);
  });

  it("removes slots the host's Google Calendar says are busy", async () => {
    const { service } = make({
      client: { calendarAccount: { findUnique: vi.fn().mockResolvedValue({ status: "active", refreshTokenCipher: "x" }) } },
      google: { accessTokenFor: vi.fn().mockResolvedValue("tok"), freeBusy: vi.fn().mockResolvedValue([{ start: at("10:30"), end: at("11:00") }]) }
    });
    (service as unknown as { accessToken: () => Promise<string> }).accessToken = async () => "tok";
    const { slots } = await service.getSlots("type1", DATE);
    expect(slots).toEqual([at("10:00")]);
  });

  it("fails closed with a 503 if the Google lookup errors", async () => {
    const { service } = make({ google: { freeBusy: vi.fn().mockRejectedValue(new Error("boom")) } });
    (service as unknown as { accessToken: () => Promise<string> }).accessToken = async () => "tok";
    await expect(service.getSlots("type1", DATE)).rejects.toThrow(ServiceUnavailableException);
  });

  it("rejects past dates and dates too far ahead", async () => {
    const { service } = make();
    await expect(service.getSlots("type1", "2020-01-06")).rejects.toThrow(BadRequestException);
    await expect(service.getSlots("type1", "2099-01-05")).rejects.toThrow(BadRequestException);
  });

  it("books: captures the lead with consent, routes it, and creates the appointment", async () => {
    const { service, client, routing, notifications } = make();
    const result = await service.book("type1", "1.1.1.1", guest);

    expect(result.ok).toBe(true);
    const lead = client.lead.create.mock.calls[0]![0].data;
    expect(lead).toMatchObject({ phone: "919812345678", source: "booking" });
    expect(lead.consents.create.source).toContain("I agree to be contacted");
    expect(routing.applyToNewLead).toHaveBeenCalledWith("ws1", "lead1");
    expect(client.appointment.create.mock.calls[0]![0].data).toMatchObject({
      appointmentTypeId: "type1",
      hostUserId: "host1",
      guestPhone: "919812345678"
    });
    expect(notifications.create).toHaveBeenCalled();
  });

  it("refuses a time that isn't an offered slot", async () => {
    const { service, client } = make();
    await expect(service.book("type1", "1.1.1.1", { ...guest, startsAt: new Date(at("10:10")).toISOString() })).rejects.toThrow("no longer available");
    expect(client.appointment.create).not.toHaveBeenCalled();
  });

  it("refuses a slot that was just taken", async () => {
    const { service } = make({
      client: { appointment: { findMany: vi.fn().mockResolvedValue([{ startsAt: new Date(at("10:00")), endsAt: new Date(at("10:30")) }]), create: vi.fn() } }
    });
    await expect(service.book("type1", "1.1.1.1", guest)).rejects.toThrow("no longer available");
  });

  it("keeps the booking even if adding it to Google Calendar fails", async () => {
    const { service, client } = make();
    (service as unknown as { accessToken: () => Promise<string> }).accessToken = async () => "tok";
    // freeBusy default resolves [], createEvent rejects
    const g = (service as unknown as { google: { createEvent: unknown } }).google;
    g.createEvent = vi.fn().mockRejectedValue(new Error("google down"));
    await expect(service.book("type1", "1.1.1.1", guest)).resolves.toMatchObject({ ok: true });
    expect(client.appointment.create).toHaveBeenCalled();
  });

  it("stores the Google event id when the calendar write succeeds", async () => {
    const { service, client } = make({ google: { createEvent: vi.fn().mockResolvedValue("evt1") } });
    (service as unknown as { accessToken: () => Promise<string> }).accessToken = async () => "tok";
    await service.book("type1", "1.1.1.1", guest);
    expect(client.appointment.update).toHaveBeenCalledWith({ where: { id: "appt1" }, data: { googleEventId: "evt1" } });
  });

  it("rate-limits repeated bookings from one ip", async () => {
    const { service } = make({ client: { appointment: { findMany: vi.fn().mockResolvedValue([]), create: vi.fn().mockResolvedValue({ id: "a" }), update: vi.fn() } } });
    for (let i = 0; i < 5; i++) await service.book("type1", "9.9.9.9", guest).catch(() => undefined);
    await expect(service.book("type1", "9.9.9.9", guest)).rejects.toThrow(HttpException);
  });
});

describe("CalendarService appointment types", () => {
  const dto = { name: "Consult", hostUserId: "host1", durationMin: 30, bufferMin: 0, minNoticeMin: 60, availability: [{ day: 1, start: "10:00", end: "12:00" }], active: true };

  it("requires the host to be a workspace member", async () => {
    const { service } = make({ client: { membership: { findUnique: vi.fn().mockResolvedValue(null) } } });
    await expect(service.createType("ws1", dto)).rejects.toThrow("host must be a member");
  });

  it("only updates or deletes types in the caller's workspace", async () => {
    const { service } = make({ client: { appointmentType: { updateMany: vi.fn().mockResolvedValue({ count: 0 }), deleteMany: vi.fn().mockResolvedValue({ count: 0 }) } } });
    await expect(service.updateType("ws1", "x", { name: "n" })).rejects.toThrow(NotFoundException);
    await expect(service.removeType("ws1", "x")).rejects.toThrow(NotFoundException);
  });
});

describe("CalendarService booking reminders", () => {
  const dto = { name: "Consult", hostUserId: "host1", durationMin: 30, bufferMin: 0, minNoticeMin: 60, availability: [{ day: 1, start: "10:00", end: "12:00" }], active: true };
  const approved = { id: "t1", metaStatus: "approved", bodyText: "Hi {{1}}, see you {{2}}" };
  const withTemplate = (template: unknown) => make({ client: { waTemplate: { findFirst: vi.fn().mockResolvedValue(template) }, appointmentType: { create: vi.fn().mockResolvedValue({ id: "ty" }) } } });

  it("accepts a reminder with an approved template from this workspace", async () => {
    const { service, client } = withTemplate(approved);
    await service.createType("ws1", { ...dto, reminderHoursBefore: 24, reminderTemplateId: "t1" });
    expect(client.waTemplate.findFirst).toHaveBeenCalledWith({ where: { id: "t1", workspaceId: "ws1" } });
    expect((client.appointmentType.create as ReturnType<typeof vi.fn>).mock.calls[0]![0].data).toMatchObject({ reminderHoursBefore: 24, reminderTemplateId: "t1" });
  });

  it("needs both the timing and the template", async () => {
    const { service } = withTemplate(approved);
    await expect(service.createType("ws1", { ...dto, reminderHoursBefore: 24 })).rejects.toThrow("both");
    await expect(service.createType("ws1", { ...dto, reminderTemplateId: "t1" })).rejects.toThrow("both");
  });

  it("rejects a template that is missing, from another workspace, or not approved", async () => {
    await expect(withTemplate(null).service.createType("ws1", { ...dto, reminderHoursBefore: 24, reminderTemplateId: "x" })).rejects.toThrow("not found");
    await expect(withTemplate({ ...approved, metaStatus: "pending" }).service.createType("ws1", { ...dto, reminderHoursBefore: 24, reminderTemplateId: "t1" })).rejects.toThrow("not approved");
  });

  it("rejects a template with too many variables", async () => {
    const { service } = withTemplate({ ...approved, bodyText: "{{1}} {{2}} {{3}} {{4}} {{5}} {{6}}" });
    await expect(service.createType("ws1", { ...dto, reminderHoursBefore: 24, reminderTemplateId: "t1" })).rejects.toThrow("at most");
  });

  it("turns a reminder off by clearing both, and checks a partial update against the stored values", async () => {
    const stored = { id: "ty", workspaceId: "ws1", reminderHoursBefore: 24, reminderTemplateId: "t1" };
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const { service } = make({ client: { appointmentType: { findFirst: vi.fn().mockResolvedValue(stored), updateMany, findUniqueOrThrow: vi.fn().mockResolvedValue(stored) } } });

    await service.updateType("ws1", "ty", { reminderHoursBefore: null, reminderTemplateId: null });
    expect(updateMany.mock.calls[0]![0].data).toMatchObject({ reminderHoursBefore: null, reminderTemplateId: null });

    // Clearing only the timing would leave a template with no schedule.
    await expect(service.updateType("ws1", "ty", { reminderHoursBefore: null })).rejects.toThrow("both");
  });
});
