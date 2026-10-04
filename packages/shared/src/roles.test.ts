import { describe, expect, it } from "vitest";
import { canRemoveMember, roleHasPermission } from "./roles";

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

describe("canRemoveMember", () => {
  const base = { isSelf: false, ownerCount: 2 };
  it("lets owners and admins remove ordinary members, and nobody else", () => {
    expect(canRemoveMember({ ...base, actorRole: "owner", targetRole: "sales" }).ok).toBe(true);
    expect(canRemoveMember({ ...base, actorRole: "admin", targetRole: "manager" }).ok).toBe(true);
    expect(canRemoveMember({ ...base, actorRole: "manager", targetRole: "sales" }).ok).toBe(false);
    expect(canRemoveMember({ ...base, actorRole: "sales", targetRole: "viewer" }).ok).toBe(false);
  });
  it("only an owner can remove an owner, and never the last one", () => {
    expect(canRemoveMember({ ...base, actorRole: "admin", targetRole: "owner" })).toEqual({ ok: false, reason: "Only an owner can remove an owner" });
    expect(canRemoveMember({ ...base, actorRole: "owner", targetRole: "owner" }).ok).toBe(true);
    expect(canRemoveMember({ isSelf: false, ownerCount: 1, actorRole: "owner", targetRole: "owner" })).toEqual({ ok: false, reason: "A workspace needs at least one owner" });
  });
  it("an owner can leave only while another owner remains", () => {
    expect(canRemoveMember({ isSelf: true, ownerCount: 2, actorRole: "owner", targetRole: "owner" }).ok).toBe(true);
    expect(canRemoveMember({ isSelf: true, ownerCount: 1, actorRole: "owner", targetRole: "owner" }).ok).toBe(false);
    expect(canRemoveMember({ isSelf: true, ownerCount: 1, actorRole: "admin", targetRole: "admin" }).ok).toBe(true);
  });
});
