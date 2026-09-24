import { describe, expect, it } from "vitest";
import { roleHasPermission } from "./roles";

describe("roleHasPermission", () => {
  it("grants owners every permission", () => {
    expect(roleHasPermission("owner", "billing.manage")).toBe(true);
    expect(roleHasPermission("owner", "audit_log.read")).toBe(true);
  });

  it("denies billing and workspace management to admins", () => {
    expect(roleHasPermission("admin", "billing.manage")).toBe(false);
    expect(roleHasPermission("admin", "workspace.manage")).toBe(false);
    expect(roleHasPermission("admin", "members.manage")).toBe(true);
  });

  it("restricts sales reps to leads and reports", () => {
    expect(roleHasPermission("sales", "leads.write")).toBe(true);
    expect(roleHasPermission("sales", "automations.manage")).toBe(false);
    expect(roleHasPermission("sales", "members.manage")).toBe(false);
  });

  it("keeps viewers read-only", () => {
    expect(roleHasPermission("viewer", "leads.read")).toBe(true);
    expect(roleHasPermission("viewer", "leads.write")).toBe(false);
    expect(roleHasPermission("viewer", "leads.delete")).toBe(false);
  });
});
