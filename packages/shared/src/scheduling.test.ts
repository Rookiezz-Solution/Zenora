import { describe, expect, it } from "vitest";
import { computeSlots, dayOfWeek, isSlotAvailable, zonedTimeToUtc, type SlotInput } from "./scheduling";

const IST = "Asia/Kolkata";
// Friday 2026-10-02
const base: SlotInput = {
  date: "2026-10-02",
  timezone: IST,
  windows: [{ day: 5, start: "10:00", end: "12:00" }],
  durationMin: 30,
  bufferMin: 0,
  busy: [],
  now: zonedTimeToUtc("2026-10-01", "09:00", IST),
  minNoticeMin: 0
};
const at = (time: string, date = "2026-10-02", tz = IST) => zonedTimeToUtc(date, time, tz);

describe("zonedTimeToUtc / dayOfWeek", () => {
  it("converts IST wall-clock time (UTC+5:30)", () => {
    expect(new Date(at("10:00")).toISOString()).toBe("2026-10-02T04:30:00.000Z");
  });
  it("handles a DST zone on both sides of the change", () => {
    expect(new Date(at("09:00", "2026-07-01", "America/New_York")).toISOString()).toBe("2026-07-01T13:00:00.000Z");
    expect(new Date(at("09:00", "2026-12-01", "America/New_York")).toISOString()).toBe("2026-12-01T14:00:00.000Z");
  });
  it("finds the weekday of a calendar date", () => {
    expect(dayOfWeek("2026-10-02")).toBe(5);
  });
});

describe("computeSlots", () => {
  it("offers back-to-back slots inside the window", () => {
    expect(computeSlots(base)).toEqual([at("10:00"), at("10:30"), at("11:00"), at("11:30")]);
  });

  it("offers nothing on a day with no availability window", () => {
    expect(computeSlots({ ...base, date: "2026-10-03" })).toEqual([]);
  });

  it("removes slots that overlap a busy interval", () => {
    const busy = [{ start: at("10:30"), end: at("11:00") }];
    expect(computeSlots({ ...base, busy })).toEqual([at("10:00"), at("11:00"), at("11:30")]);
  });

  it("pads slots with the buffer on both sides", () => {
    const busy = [{ start: at("11:00"), end: at("11:30") }];
    expect(computeSlots({ ...base, bufferMin: 15, busy })).toEqual([at("10:00")]);
  });

  it("drops slots inside the minimum notice period", () => {
    const now = at("10:10");
    expect(computeSlots({ ...base, now, minNoticeMin: 30 })).toEqual([at("11:00"), at("11:30")]);
  });

  it("never offers a slot that would run past the end of the window", () => {
    expect(computeSlots({ ...base, durationMin: 45 })).toEqual([at("10:00"), at("10:45")]);
  });

  it("supports several windows in one day", () => {
    const windows = [
      { day: 5, start: "10:00", end: "10:30" },
      { day: 5, start: "15:00", end: "15:30" }
    ];
    expect(computeSlots({ ...base, windows })).toEqual([at("10:00"), at("15:00")]);
  });
});

describe("isSlotAvailable", () => {
  it("only accepts starts that computeSlots would offer", () => {
    expect(isSlotAvailable(at("10:30"), base)).toBe(true);
    expect(isSlotAvailable(at("10:15"), base)).toBe(false);
    expect(isSlotAvailable(at("13:00"), base)).toBe(false);
  });
});
