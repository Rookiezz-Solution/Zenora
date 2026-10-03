import { describe, expect, it } from "vitest";
import { defaultCountryCodeForTimezone, hasActiveConsent, phoneForAudience } from "./consent";

const d = (iso: string) => new Date(iso);

describe("hasActiveConsent", () => {
  it("is false with no record, and true after a grant", () => {
    expect(hasActiveConsent([], "marketing")).toBe(false);
    expect(hasActiveConsent([{ type: "marketing", granted: true, createdAt: d("2026-03-01") }], "marketing")).toBe(true);
  });

  it("lets a later withdrawal override an earlier grant", () => {
    const history = [
      { type: "marketing", granted: true, createdAt: d("2026-03-01") },
      { type: "marketing", granted: false, createdAt: d("2026-05-01") }
    ];
    expect(hasActiveConsent(history, "marketing")).toBe(false);
  });

  it("lets a later re-grant override a withdrawal, whatever order the records arrive in", () => {
    const history = [
      { type: "marketing", granted: true, createdAt: d("2026-07-01") },
      { type: "marketing", granted: false, createdAt: d("2026-05-01") },
      { type: "marketing", granted: true, createdAt: d("2026-03-01") }
    ];
    expect(hasActiveConsent(history, "marketing")).toBe(true);
  });

  it("only counts the type asked about", () => {
    expect(hasActiveConsent([{ type: "data_processing", granted: true, createdAt: d("2026-03-01") }], "marketing")).toBe(false);
  });

  it("accepts ISO strings as well as dates", () => {
    expect(hasActiveConsent([{ type: "marketing", granted: true, createdAt: "2026-03-01T00:00:00Z" }], "marketing")).toBe(true);
  });
});

describe("phoneForAudience", () => {
  it("completes a 10-digit Indian number with 91 and leaves numbers that already have a country code", () => {
    expect(phoneForAudience("9876543210", "91")).toBe("919876543210");
    expect(phoneForAudience("919876543210", "91")).toBe("919876543210");
    expect(phoneForAudience("+91 98765-43210", "91")).toBe("919876543210");
  });

  it("drops a leading trunk zero, and does not guess a country code when none is configured", () => {
    expect(phoneForAudience("09876543210", "91")).toBe("919876543210");
    expect(phoneForAudience("9876543210", null)).toBe("9876543210");
  });

  it("rejects values that cannot be phone numbers", () => {
    expect(phoneForAudience("12345", "91")).toBeNull();
    expect(phoneForAudience("1".repeat(16), "91")).toBeNull();
    expect(phoneForAudience("", "91")).toBeNull();
  });
});

describe("defaultCountryCodeForTimezone", () => {
  it("knows India only", () => {
    expect(defaultCountryCodeForTimezone("Asia/Kolkata")).toBe("91");
    expect(defaultCountryCodeForTimezone("Europe/London")).toBeNull();
  });
});
