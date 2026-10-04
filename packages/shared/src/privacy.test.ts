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

import { DELETION_GRACE_DAYS, deletionDueAt, invoiceRetainUntil } from "./privacy";

describe("workspace deletion timing", () => {
  it("is due after the grace period", () => {
    expect(deletionDueAt(new Date("2026-10-10T00:00:00Z")).toISOString()).toBe("2026-10-17T00:00:00.000Z");
    expect(DELETION_GRACE_DAYS).toBe(7);
  });
  it("keeps invoices for eight years from issue", () => {
    expect(invoiceRetainUntil(new Date("2026-03-15T00:00:00Z")).toISOString()).toBe("2034-03-15T00:00:00.000Z");
  });
});
