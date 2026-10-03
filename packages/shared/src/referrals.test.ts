import { describe, expect, it } from "vitest";
import { REFERRAL_CODE_LENGTH, computeCommission, generateReferralCode, isReferralFresh, isWithinCommissionWindow, normalizeReferralCode } from "./referrals";

describe("referral codes", () => {
  it("generates fixed-length codes from the unambiguous alphabet", () => {
    let n = 0;
    const code = generateReferralCode((max) => n++ % max);
    expect(code).toHaveLength(REFERRAL_CODE_LENGTH);
    expect(normalizeReferralCode(code)).toBe(code);
    expect(code).not.toMatch(/[01OI]/);
  });

  it("normalises case and whitespace, and rejects anything else", () => {
    expect(normalizeReferralCode("  abcd2345 ")).toBe("ABCD2345");
    expect(normalizeReferralCode("ABCD234")).toBeNull();
    expect(normalizeReferralCode("ABCD234O")).toBeNull(); // O is not in the alphabet
    expect(normalizeReferralCode("ABCD 345")).toBeNull();
    expect(normalizeReferralCode("")).toBeNull();
  });
});

describe("computeCommission", () => {
  it("takes the default 20% of the pre-GST amount, rounded to whole rupees", () => {
    expect(computeCommission(1499)).toBe(300); // 299.8
    expect(computeCommission(3999)).toBe(800); // 799.8
    expect(computeCommission(0)).toBe(0);
  });
  it("accepts another percentage", () => {
    expect(computeCommission(1000, 10)).toBe(100);
  });
});

describe("isWithinCommissionWindow", () => {
  const referred = new Date("2026-01-15T00:00:00Z");
  it("covers the twelve months after the referral, inclusive", () => {
    expect(isWithinCommissionWindow(referred, new Date("2026-01-15T00:00:00Z"))).toBe(true);
    expect(isWithinCommissionWindow(referred, new Date("2026-12-31T00:00:00Z"))).toBe(true);
    expect(isWithinCommissionWindow(referred, new Date("2027-01-15T00:00:00Z"))).toBe(true);
  });
  it("excludes anything after the window or before the referral", () => {
    expect(isWithinCommissionWindow(referred, new Date("2027-01-16T00:00:00Z"))).toBe(false);
    expect(isWithinCommissionWindow(referred, new Date("2026-01-14T00:00:00Z"))).toBe(false);
  });
});

describe("isReferralFresh", () => {
  const day = 86_400_000;
  it("honours a link for 30 days only", () => {
    expect(isReferralFresh(0, 29 * day)).toBe(true);
    expect(isReferralFresh(0, 30 * day)).toBe(true);
    expect(isReferralFresh(0, 31 * day)).toBe(false);
    expect(isReferralFresh(10 * day, 0)).toBe(false); // captured "in the future" is nonsense
  });
});
