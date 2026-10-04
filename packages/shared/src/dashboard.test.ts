import { describe, expect, it } from "vitest";
import { firstResponseMinutes, formatDuration, isWaitingForReply, median, medianSpeedToLeadMinutes, percentChange } from "./dashboard";

const at = (iso: string) => new Date(`2026-10-01T${iso}:00Z`);
const m = (direction: "inbound" | "outbound", time: string) => ({ direction, createdAt: at(time) });

describe("firstResponseMinutes", () => {
  it("is the gap from the first inbound message to the first reply", () => {
    expect(firstResponseMinutes([m("inbound", "10:00"), m("outbound", "10:07"), m("outbound", "11:00")])).toBe(7);
  });
  it("ignores order of arrival and anything we sent before they wrote", () => {
    expect(firstResponseMinutes([m("outbound", "09:00"), m("outbound", "10:30"), m("inbound", "10:00")])).toBe(30);
  });
  it("has no figure for an unanswered or never-inbound thread", () => {
    expect(firstResponseMinutes([m("inbound", "10:00")])).toBeNull();
    expect(firstResponseMinutes([m("outbound", "10:00")])).toBeNull();
    expect(firstResponseMinutes([])).toBeNull();
  });
});

describe("median and speed to lead", () => {
  it("takes the middle value, so one slow enquiry doesn't distort it", () => {
    expect(median([5, 6, 7, 900])).toBe(6.5);
    expect(median([3])).toBe(3);
    expect(median([])).toBeNull();
  });
  it("is the median first-response time over answered threads only", () => {
    const threads = [[m("inbound", "10:00"), m("outbound", "10:05")], [m("inbound", "10:00"), m("outbound", "10:15")], [m("inbound", "10:00")]];
    expect(medianSpeedToLeadMinutes(threads)).toBe(10);
    expect(medianSpeedToLeadMinutes([[m("inbound", "10:00")]])).toBeNull();
  });
});

describe("isWaitingForReply", () => {
  it("is true when the customer spoke last", () => {
    expect(isWaitingForReply([m("inbound", "10:00"), m("outbound", "10:05"), m("inbound", "10:20")])).toBe(true);
    expect(isWaitingForReply([m("inbound", "10:00"), m("outbound", "10:05")])).toBe(false);
    expect(isWaitingForReply([])).toBe(false);
  });
});

describe("percentChange", () => {
  it("compares with the previous period, and gives nothing to compare against zero", () => {
    expect(percentChange(15, 10)).toBe(50);
    expect(percentChange(5, 10)).toBe(-50);
    expect(percentChange(5, 0)).toBeNull();
  });
});

describe("formatDuration", () => {
  it("reads naturally at every scale", () => {
    expect(formatDuration(null)).toBe("—");
    expect(formatDuration(0.4)).toBe("under a minute");
    expect(formatDuration(12)).toBe("12 min");
    expect(formatDuration(90)).toBe("1.5 h");
    expect(formatDuration(60 * 72)).toBe("3 days");
  });
});
