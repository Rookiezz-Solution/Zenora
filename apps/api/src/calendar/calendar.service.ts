import { BadRequestException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { Prisma } from "@zenora/db";
import {
  LINK_IN_BIO_CONSENT_TEXT,
  MAX_TEMPLATE_VARIABLES,
  computeSlots,
  isSlotAvailable,
  normalizePhone,
  templateVariableCount,
  zonedTimeToUtc,
  type AvailabilityWindow,
  type Interval,
  type SlotInput
} from "@zenora/shared";
import { decryptToken, encryptToken } from "../common/encryption";
import { captureLeadWithConsent } from "../common/public-lead";
import { WebhooksService } from "../developers/webhooks.service";
import { RateLimiter } from "../common/rate-limiter";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import { RoutingEngineService } from "../routing/routing-engine.service";
import { appointmentManageKey, parseAppointmentManageKey } from "../common/appointment-token";
import type { AppointmentTypeDto, BookDto, RescheduleDto, UpdateAppointmentTypeDto } from "./calendar.dto";
import { GoogleCalendarClient } from "./google-calendar.client";

const MAX_DAYS_AHEAD = 60;
const DAY_MS = 86_400_000;

@Injectable()
export class CalendarService {
  private readonly logger = new Logger(CalendarService.name);
  private readonly bookLimiter = new RateLimiter(5, 10 * 60_000, "booking");
  private readonly manageLimiter = new RateLimiter(20, 10 * 60_000, "booking-manage");

  constructor(
    private readonly prisma: PrismaService,
    private readonly google: GoogleCalendarClient,
    private readonly routing: RoutingEngineService,
    private readonly notifications: NotificationsService,
    private readonly webhooks: WebhooksService
  ) {}

  // --- Google connection (each member connects their own account) ---------

  async handleCallback(code: string, workspaceId: string, userId: string) {
    const { refreshToken, email } = await this.google.exchangeCode(code);
    const data = { googleEmail: email, refreshTokenCipher: encryptToken(refreshToken), status: "active" };
    await this.prisma.client.calendarAccount.upsert({
      where: { workspaceId_userId: { workspaceId, userId } },
      create: { workspaceId, userId, ...data },
      update: data
    });
  }

  async status(workspaceId: string, userId: string) {
    const account = await this.prisma.client.calendarAccount.findUnique({ where: { workspaceId_userId: { workspaceId, userId } } });
    return { connected: account?.status === "active", email: account?.googleEmail ?? null };
  }

  async disconnect(workspaceId: string, userId: string) {
    await this.prisma.client.calendarAccount.deleteMany({ where: { workspaceId, userId } });
  }

  // --- Appointment types ---------------------------------------------------

  listTypes(workspaceId: string) {
    return this.prisma.client.appointmentType.findMany({ where: { workspaceId }, orderBy: { createdAt: "asc" } });
  }

  async createType(workspaceId: string, dto: AppointmentTypeDto) {
    await this.ensureMember(workspaceId, dto.hostUserId);
    await this.assertReminderConfig(workspaceId, dto.reminderHoursBefore ?? null, dto.reminderTemplateId ?? null);
    return this.prisma.client.appointmentType.create({
      data: { workspaceId, ...dto, availability: dto.availability as unknown as Prisma.InputJsonValue }
    });
  }

  async updateType(workspaceId: string, id: string, dto: UpdateAppointmentTypeDto) {
    if (dto.hostUserId) await this.ensureMember(workspaceId, dto.hostUserId);
    if (dto.reminderHoursBefore !== undefined || dto.reminderTemplateId !== undefined) {
      const current = await this.prisma.client.appointmentType.findFirst({ where: { id, workspaceId } });
      if (!current) throw new NotFoundException("Appointment type not found");
      await this.assertReminderConfig(
        workspaceId,
        dto.reminderHoursBefore !== undefined ? dto.reminderHoursBefore : current.reminderHoursBefore,
        dto.reminderTemplateId !== undefined ? dto.reminderTemplateId : current.reminderTemplateId
      );
    }
    const { availability, ...rest } = dto;
    const result = await this.prisma.client.appointmentType.updateMany({
      where: { id, workspaceId },
      data: { ...rest, ...(availability ? { availability: availability as unknown as Prisma.InputJsonValue } : {}) }
    });
    if (result.count === 0) throw new NotFoundException("Appointment type not found");
    return this.prisma.client.appointmentType.findUniqueOrThrow({ where: { id } });
  }

  async removeType(workspaceId: string, id: string) {
    const result = await this.prisma.client.appointmentType.deleteMany({ where: { id, workspaceId } });
    if (result.count === 0) throw new NotFoundException("Appointment type not found");
  }

  listAppointments(workspaceId: string, from: Date, to: Date) {
    return this.prisma.client.appointment.findMany({
      where: { workspaceId, status: "booked", startsAt: { gte: from, lt: to } },
      include: { appointmentType: { select: { name: true } } },
      orderBy: { startsAt: "asc" }
    });
  }

  // Hours and template go together. The template must be this workspace's and
  // already approved — a reminder that can never send would fail silently
  // the night before the appointment.
  private async assertReminderConfig(workspaceId: string, hours: number | null, templateId: string | null) {
    if (hours === null && templateId === null) return;
    if (hours === null || templateId === null) throw new BadRequestException("Choose both when to send the reminder and which template to use");
    const template = await this.prisma.client.waTemplate.findFirst({ where: { id: templateId, workspaceId } });
    if (!template) throw new BadRequestException("Reminder template not found");
    if (template.metaStatus !== "approved") throw new BadRequestException("That template is not approved by Meta yet");
    if (templateVariableCount(template.bodyText) > MAX_TEMPLATE_VARIABLES) throw new BadRequestException(`Use a template with at most  variables`);
  }

  private async ensureMember(workspaceId: string, userId: string) {
    const member = await this.prisma.client.membership.findUnique({ where: { workspaceId_userId: { workspaceId, userId } } });
    if (!member) throw new BadRequestException("The host must be a member of this workspace");
  }

  // --- Public booking ------------------------------------------------------

  async getPublicType(id: string) {
    const type = await this.activeType(id);
    return {
      name: type.name,
      durationMin: type.durationMin,
      businessName: type.workspace.name,
      timezone: type.workspace.timezone,
      consentText: LINK_IN_BIO_CONSENT_TEXT
    };
  }

  async getSlots(id: string, date: string) {
    const type = await this.activeType(id);
    this.assertBookableDate(date, type.workspace.timezone);
    const input = await this.slotInput(type, date);
    return { timezone: type.workspace.timezone, slots: computeSlots(input) };
  }

  async book(id: string, ip: string, dto: BookDto) {
    await this.bookLimiter.consume(`${ip}:${id}`);
    const type = await this.activeType(id);
    this.assertBookableDate(dto.date, type.workspace.timezone);
    const phone = normalizePhone(dto.phone);
    if (!phone) throw new BadRequestException("Enter a valid phone number");

    // Re-derive availability server-side: the guest can only book a slot we'd
    // have offered them. (Two guests racing for the same slot at the same
    // instant is a known small window — see docs/PROGRESS.md.)
    const startsAtMs = Date.parse(dto.startsAt);
    const input = await this.slotInput(type, dto.date);
    if (!isSlotAvailable(startsAtMs, input)) throw new BadRequestException("That time is no longer available — please pick another");

    const { leadId, created } = await captureLeadWithConsent(this.prisma, {
      workspaceId: type.workspaceId,
      name: dto.name,
      phone,
      source: "booking",
      consentSource: `booking:${type.id} | ${LINK_IN_BIO_CONSENT_TEXT}`
    });
    if (created) {
      await this.routing.applyToNewLead(type.workspaceId, leadId);
      await this.webhooks.emitLeadCreated(type.workspaceId, leadId);
    }

    const startsAt = new Date(startsAtMs);
    const endsAt = new Date(startsAtMs + type.durationMin * 60_000);
    const appointment = await this.prisma.client.appointment.create({
      data: {
        workspaceId: type.workspaceId,
        appointmentTypeId: type.id,
        leadId,
        hostUserId: type.hostUserId,
        startsAt,
        endsAt,
        guestName: dto.name,
        guestPhone: phone
      }
    });

    const googleEventId = await this.addToGoogleCalendar(type.workspaceId, type.hostUserId, {
      summary: `${type.name} — ${dto.name}`,
      description: `Booked via Zenora. Phone: ${phone}`,
      startsAt,
      endsAt
    });
    if (googleEventId) await this.prisma.client.appointment.update({ where: { id: appointment.id }, data: { googleEventId } });

    await this.webhooks.emit(type.workspaceId, "appointment.booked", {
      id: appointment.id,
      leadId,
      appointmentType: { id: type.id, name: type.name },
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      guestName: dto.name,
      guestPhone: phone
    });

    await this.notifications
      .create({
        workspaceId: type.workspaceId,
        type: "appointment_booked",
        title: `New booking: ${type.name}`,
        body: `${dto.name} booked ${startsAt.toISOString()}`
      })
      .catch(() => undefined);

    return { ok: true, startsAt: startsAt.toISOString(), manageKey: appointmentManageKey(appointment.id) };
  }

  // --- Changing a booking: staff (signed in) or the guest (their private link) ---

  async cancelAppointment(workspaceId: string, id: string, by: "staff" | "guest" = "staff") {
    const appt = await this.bookedAppointment(id, workspaceId);
    await this.prisma.client.appointment.update({ where: { id }, data: { status: "cancelled" } });
    if (appt.googleEventId) await this.removeFromGoogleCalendar(appt.workspaceId, appt.hostUserId, appt.googleEventId);
    await this.webhooks.emit(appt.workspaceId, "appointment.cancelled", this.appointmentPayload(appt, { cancelledBy: by }));
    if (by === "guest") {
      await this.notifications
        .create({ workspaceId: appt.workspaceId, type: "appointment_cancelled", title: `Booking cancelled: ${appt.appointmentType.name}`, body: `${appt.guestName} cancelled ${appt.startsAt.toISOString()}` })
        .catch(() => undefined);
    }
    return { ok: true };
  }

  async rescheduleAppointment(workspaceId: string, id: string, dto: RescheduleDto, by: "staff" | "guest" = "staff") {
    const appt = await this.bookedAppointment(id, workspaceId);
    const type = await this.activeType(appt.appointmentTypeId);
    this.assertBookableDate(dto.date, type.workspace.timezone);
    const startsAtMs = Date.parse(dto.startsAt);
    // The booking itself does not count as busy, so it can be moved a little.
    const input = await this.slotInput(type, dto.date, id);
    if (!isSlotAvailable(startsAtMs, input)) throw new BadRequestException("That time is no longer available — please pick another");

    const startsAt = new Date(startsAtMs);
    const endsAt = new Date(startsAtMs + type.durationMin * 60_000);
    // A fresh reminder is owed for the new time, even if one was sent for the old one.
    const updated = await this.prisma.client.appointment.update({
      where: { id },
      data: { startsAt, endsAt, reminderStatus: null, reminderSentAt: null, reminderError: null },
      include: { appointmentType: { select: { name: true } } }
    });
    if (appt.googleEventId) await this.moveInGoogleCalendar(appt.workspaceId, appt.hostUserId, appt.googleEventId, startsAt, endsAt);
    await this.webhooks.emit(appt.workspaceId, "appointment.rescheduled", { ...this.appointmentPayload(updated), previousStartsAt: appt.startsAt.toISOString(), rescheduledBy: by });
    if (by === "guest") {
      await this.notifications
        .create({ workspaceId: appt.workspaceId, type: "appointment_rescheduled", title: `Booking moved: ${appt.appointmentType.name}`, body: `${appt.guestName} moved it to ${startsAt.toISOString()}` })
        .catch(() => undefined);
    }
    return { ok: true, startsAt: startsAt.toISOString() };
  }

  // The guest page: what they booked, and whether it can still be changed.
  async manageView(key: string, ip: string) {
    const appt = await this.appointmentFromKey(key, ip);
    const type = await this.prisma.client.appointmentType.findUnique({ where: { id: appt.appointmentTypeId }, include: { workspace: { select: { name: true, timezone: true } } } });
    return {
      typeId: appt.appointmentTypeId,
      name: appt.appointmentType.name,
      businessName: type?.workspace.name ?? "",
      timezone: type?.workspace.timezone ?? "UTC",
      durationMin: type?.durationMin ?? 0,
      startsAt: appt.startsAt.toISOString(),
      status: appt.status,
      canChange: appt.status === "booked" && appt.startsAt.getTime() > Date.now(),
      canReschedule: Boolean(type?.active)
    };
  }

  // Times this booking could move to (its own slot counts as free).
  async appointmentSlots(workspaceId: string, id: string, date: string) {
    const appt = await this.bookedAppointment(id, workspaceId);
    const type = await this.activeType(appt.appointmentTypeId);
    this.assertBookableDate(date, type.workspace.timezone);
    return { timezone: type.workspace.timezone, slots: computeSlots(await this.slotInput(type, date, id)) };
  }

  async manageSlots(key: string, ip: string, date: string) {
    const appt = await this.appointmentFromKey(key, ip);
    if (appt.status !== "booked") throw new BadRequestException("This booking is no longer active");
    const type = await this.activeType(appt.appointmentTypeId);
    this.assertBookableDate(date, type.workspace.timezone);
    return { timezone: type.workspace.timezone, slots: computeSlots(await this.slotInput(type, date, appt.id)) };
  }

  async manageCancel(key: string, ip: string) {
    const appt = await this.appointmentFromKey(key, ip);
    return this.cancelAppointment(appt.workspaceId, appt.id, "guest");
  }

  async manageReschedule(key: string, ip: string, dto: RescheduleDto) {
    const appt = await this.appointmentFromKey(key, ip);
    return this.rescheduleAppointment(appt.workspaceId, appt.id, dto, "guest");
  }

  private async appointmentFromKey(key: string, ip: string) {
    await this.manageLimiter.consume(ip);
    const id = parseAppointmentManageKey(key);
    const appt = id ? await this.prisma.client.appointment.findUnique({ where: { id }, include: { appointmentType: { select: { name: true } } } }) : null;
    if (!appt) throw new NotFoundException("Booking not found");
    return appt;
  }

  // Must exist in this workspace, still be booked and not already have happened.
  private async bookedAppointment(id: string, workspaceId: string) {
    const appt = await this.prisma.client.appointment.findFirst({ where: { id, workspaceId }, include: { appointmentType: { select: { name: true } } } });
    if (!appt) throw new NotFoundException("Appointment not found");
    if (appt.status !== "booked") throw new BadRequestException("This booking is already cancelled");
    if (appt.startsAt.getTime() <= Date.now()) throw new BadRequestException("This booking has already taken place");
    return appt;
  }

  private appointmentPayload(appt: { id: string; leadId: string | null; appointmentTypeId: string; appointmentType: { name: string }; startsAt: Date; endsAt: Date; guestName: string; guestPhone: string }, extra: Record<string, unknown> = {}) {
    return {
      id: appt.id,
      leadId: appt.leadId,
      appointmentType: { id: appt.appointmentTypeId, name: appt.appointmentType.name },
      startsAt: appt.startsAt.toISOString(),
      endsAt: appt.endsAt.toISOString(),
      guestName: appt.guestName,
      guestPhone: appt.guestPhone,
      ...extra
    };
  }

  // --- internals -----------------------------------------------------------

  private async activeType(id: string) {
    const type = await this.prisma.client.appointmentType.findUnique({
      where: { id },
      include: { workspace: { select: { name: true, timezone: true } } }
    });
    if (!type || !type.active) throw new NotFoundException("Booking page not found");
    return type;
  }

  private assertBookableDate(date: string, timezone: string) {
    const dayStart = zonedTimeToUtc(date, "00:00", timezone);
    const now = Date.now();
    if (Number.isNaN(dayStart) || dayStart + DAY_MS <= now) throw new BadRequestException("Pick a date in the future");
    if (dayStart > now + MAX_DAYS_AHEAD * DAY_MS) throw new BadRequestException(`Bookings open up to ${MAX_DAYS_AHEAD} days ahead`);
  }

  private async slotInput(type: Awaited<ReturnType<CalendarService["activeType"]>>, date: string, excludeAppointmentId?: string): Promise<SlotInput> {
    const tz = type.workspace.timezone;
    const bufferMs = type.bufferMin * 60_000;
    const dayStart = zonedTimeToUtc(date, "00:00", tz);
    const from = new Date(dayStart - bufferMs);
    const to = new Date(dayStart + DAY_MS + bufferMs);

    const booked = await this.prisma.client.appointment.findMany({
      where: { hostUserId: type.hostUserId, status: "booked", startsAt: { lt: to }, endsAt: { gt: from }, ...(excludeAppointmentId ? { id: { not: excludeAppointmentId } } : {}) },
      select: { startsAt: true, endsAt: true }
    });
    const busy: Interval[] = booked.map((a) => ({ start: a.startsAt.getTime(), end: a.endsAt.getTime() }));
    busy.push(...(await this.googleBusy(type.workspaceId, type.hostUserId, from, to)));

    return {
      date,
      timezone: tz,
      windows: type.availability as unknown as AvailabilityWindow[],
      durationMin: type.durationMin,
      bufferMin: type.bufferMin,
      busy,
      now: Date.now(),
      minNoticeMin: type.minNoticeMin
    };
  }

  private async accessToken(workspaceId: string, userId: string): Promise<string | null> {
    const account = await this.prisma.client.calendarAccount.findUnique({ where: { workspaceId_userId: { workspaceId, userId } } });
    if (!account || account.status !== "active") return null;
    return this.google.accessTokenFor(decryptToken(account.refreshTokenCipher));
  }

  // If the host connected Google, their real calendar blocks slots. Failing
  // closed (an error, no slots) beats double-booking someone's actual calendar.
  private async googleBusy(workspaceId: string, userId: string, from: Date, to: Date): Promise<Interval[]> {
    try {
      const token = await this.accessToken(workspaceId, userId);
      return token ? await this.google.freeBusy(token, from, to) : [];
    } catch (err) {
      this.logger.error("Google Calendar availability lookup failed", err instanceof Error ? err.stack : String(err));
      throw new ServiceUnavailableException("Availability is temporarily unavailable — please try again shortly");
    }
  }

  // A failed calendar write never loses the booking itself.
  private async addToGoogleCalendar(workspaceId: string, userId: string, event: Parameters<GoogleCalendarClient["createEvent"]>[1]) {
    try {
      const token = await this.accessToken(workspaceId, userId);
      return token ? await this.google.createEvent(token, event) : null;
    } catch (err) {
      this.logger.warn(`Could not add the booking to Google Calendar: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  private async removeFromGoogleCalendar(workspaceId: string, userId: string, eventId: string) {
    try {
      const token = await this.accessToken(workspaceId, userId);
      if (token) await this.google.deleteEvent(token, eventId);
    } catch (err) {
      this.logger.warn(`Could not remove the booking from Google Calendar: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private async moveInGoogleCalendar(workspaceId: string, userId: string, eventId: string, startsAt: Date, endsAt: Date) {
    try {
      const token = await this.accessToken(workspaceId, userId);
      if (token) await this.google.updateEvent(token, eventId, { startsAt, endsAt });
    } catch (err) {
      this.logger.warn(`Could not move the booking in Google Calendar: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
