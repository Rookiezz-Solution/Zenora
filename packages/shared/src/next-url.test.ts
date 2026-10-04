import { describe, expect, it } from "vitest";
import { safeNext, withNext } from "./next-url";

describe("safeNext", () => {
  it("accepts a path on this site, with its query", () => {
    expect(safeNext("?next=/invite/abc123")).toBe("/invite/abc123");
    expect(safeNext("?x=1&next=%2Fsettings%2Fteam%3Ftab%3D2")).toBe("/settings/team?tab=2");
  });

  it("refuses anything that could leave the site", () => {
    for (const bad of ["https://evil.com", "//evil.com", "/" + String.fromCharCode(92) + "evil.com", "javascript:alert(1)", "evil.com", "", "/\t/evil.com", "/\n/evil.com"]) {
      expect(safeNext("?next=" + encodeURIComponent(bad))).toBeNull();
    }
  });

  it("is null when there is no next", () => {
    expect(safeNext("")).toBeNull();
    expect(safeNext("?other=1")).toBeNull();
  });
});

describe("withNext", () => {
  it("adds the encoded destination, or leaves the link alone", () => {
    expect(withNext("/signup", "/invite/a b")).toBe("/signup?next=%2Finvite%2Fa%20b");
    expect(withNext("/signup", null)).toBe("/signup");
  });
});
