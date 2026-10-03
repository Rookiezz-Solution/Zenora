import { describe, expect, it } from "vitest";
import { isValidMessageRetention, retentionCutoff } from "./privacy";

describe("retentionCutoff", () => {
  it("is exactly N days before now", () => {
    const now = new Date("2026-10-10T12:00:00Z");
    expect(retentionCutoff(now, 30).toISOString()).toBe("2026-09-10T12:00:00.000Z");
  });
});

describe("isValidMessageRetention", () => {
  it("accepts keeping everything (null) and the offered periods only", () => {
    expect(isValidMessageRetention(null)).toBe(true);
    expect(isValidMessageRetention(365)).toBe(true);
    expect(isValidMessageRetention(7)).toBe(false);
    expect(isValidMessageRetention(0)).toBe(false);
  });
});
