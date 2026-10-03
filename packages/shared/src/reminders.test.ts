import { describe, expect, it } from "vitest";
import { buildReminderParams, formatAppointmentTime, isReminderDue, templateVariableCount } from "./reminders";

const HOUR = 3_600_000;

describe("templateVariableCount", () => {
  it("counts the highest placeholder, however spaced", () => {
    expect(templateVariableCount("No variables")).toBe(0);
    expect(templateVariableCount("Hi {{1}}, see you {{ 2 }}")).toBe(2);
    expect(templateVariableCount("{{3}} then {{1}}")).toBe(3);
  });
});

describe("buildReminderParams", () => {
  const vars = { guestName: "Asha", when: "Tue, 7 Oct, 10:30 am", service: "Consultation" };
  it("fills name, time, service in order", () => {
    expect(buildReminderParams("Hi {{1}}, {{3}} on {{2}}", vars)).toEqual(["Asha", "Tue, 7 Oct, 10:30 am", "Consultation"]);
  });
  it("sends nothing for a template with no variables", () => {
    expect(buildReminderParams("Reminder: your visit is soon", vars)).toEqual([]);
  });
  it("pads extra placeholders so the parameter count still matches", () => {
    expect(buildReminderParams("{{1}} {{2}} {{3}} {{4}}", vars)).toHaveLength(4);
    expect(buildReminderParams("{{1}} {{2}} {{3}} {{4}}", vars)[3]).toBe("-");
  });
});

describe("formatAppointmentTime", () => {
  it("renders in the workspace timezone", () => {
    // 05:00 UTC is 10:30 in India.
    const text = formatAppointmentTime(Date.UTC(2026, 9, 7, 5, 0), "Asia/Kolkata");
    expect(text).toContain("10:30");
    expect(text.toLowerCase()).toContain("am");
  });
});

describe("isReminderDue", () => {
  const startsAtMs = 100 * HOUR;
  const base = { startsAtMs, createdAtMs: 0, hoursBefore: 24 };

  it("is not due before the window opens", () => {
    expect(isReminderDue(base, 75 * HOUR)).toBe(false);
  });
  it("is due from the window opening until the start", () => {
    expect(isReminderDue(base, 76 * HOUR)).toBe(true);
    expect(isReminderDue(base, 99 * HOUR)).toBe(true);
  });
  it("is never due once the appointment has started", () => {
    expect(isReminderDue(base, 100 * HOUR)).toBe(false);
    expect(isReminderDue(base, 101 * HOUR)).toBe(false);
  });
  it("skips a booking made inside the reminder window", () => {
    expect(isReminderDue({ ...base, createdAtMs: 80 * HOUR }, 90 * HOUR)).toBe(false);
  });
});
