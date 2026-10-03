import { describe, expect, it } from "vitest";
import { LINK_IN_BIO_SLUG_PATTERN, normalizePhone } from "./link-in-bio";

describe("normalizePhone", () => {
  it("strips separators and a leading plus", () => {
    expect(normalizePhone("+91 98765-43210")).toBe("919876543210");
  });
  it("rejects too-short, too-long and non-numeric input", () => {
    expect(normalizePhone("12345")).toBeNull();
    expect(normalizePhone("1234567890123456")).toBeNull();
    expect(normalizePhone("call me")).toBeNull();
  });
});

describe("LINK_IN_BIO_SLUG_PATTERN", () => {
  it("accepts lowercase letters, digits and inner hyphens", () => {
    expect(LINK_IN_BIO_SLUG_PATTERN.test("asha-clinic")).toBe(true);
  });
  it("rejects uppercase, spaces, edge hyphens and too-short slugs", () => {
    for (const bad of ["Asha", "a b", "-ab", "ab-", "ab"]) expect(LINK_IN_BIO_SLUG_PATTERN.test(bad)).toBe(false);
  });
});
