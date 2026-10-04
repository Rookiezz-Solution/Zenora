import { MAX_REMINDER_HOURS } from "@zenora/shared";
import { z } from "zod";

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM");

const windowSchema = z
  .object({ day: z.number().int().min(0).max(6), start: time, end: time })
  .refine((w) => w.end > w.start, { message: "End must be after start" });

export const appointmentTypeSchema = z.object({
  name: z.string().trim().min(1).max(80),
  hostUserId: z.string().min(1),
  durationMin: z.number().int().min(5).max(480),
  bufferMin: z.number().int().min(0).max(120).default(0),
  minNoticeMin: z.number().int().min(0).max(10_080).default(60),
  availability: z.array(windowSchema).min(1),
  active: z.boolean().default(true),
  // WhatsApp reminder to the guest N hours before; both set, or both null.
  reminderHoursBefore: z.number().int().min(1).max(MAX_REMINDER_HOURS).nullable().optional(),
  reminderTemplateId: z.string().min(1).nullable().optional()
});
export type AppointmentTypeDto = z.infer<typeof appointmentTypeSchema>;

export const updateAppointmentTypeSchema = appointmentTypeSchema.partial();
export type UpdateAppointmentTypeDto = z.infer<typeof updateAppointmentTypeSchema>;

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const slotsQuerySchema = z.object({ date: dateString });

// consent must be literally true — the form's tick box, never defaulted.
export const bookSchema = z.object({
  date: dateString,
  startsAt: z.string().datetime(),
  name: z.string().trim().min(1).max(100),
  phone: z.string().min(1).max(30),
  consent: z.literal(true)
});
export type BookDto = z.infer<typeof bookSchema>;

export const rescheduleSchema = z.object({ date: dateString, startsAt: z.string().datetime() });
export type RescheduleDto = z.infer<typeof rescheduleSchema>;
