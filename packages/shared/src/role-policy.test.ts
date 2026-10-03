import { describe, expect, it } from "vitest";
import { canChangeMemberRole, canInviteWithRole, type WorkspaceRole } from "./roles";

const change = (o: Partial<Parameters<typeof canChangeMemberRole>[0]>) =>
  canChangeMemberRole({ actorRole: "admin", targetRole: "sales", newRole: "manager", isSelf: false, ownerCount: 1, ...o });

describe("canChangeMemberRole", () => {
  it("lets owners and admins change ordinary roles", () => {
    expect(change({}).ok).toBe(true);
    expect(change({ actorRole: "owner" }).ok).toBe(true);
  });

  it("stops everyone else from changing roles at all", () => {
    for (const actorRole of ["manager", "sales", "viewer"] as WorkspaceRole[]) expect(change({ actorRole }).ok).toBe(false);
  });

  it("stops an admin promoting anyone, or themselves, to owner", () => {
    expect(change({ newRole: "owner" })).toEqual({ ok: false, reason: "Only an owner can grant or change the owner role" });
    expect(change({ newRole: "owner", isSelf: true, targetRole: "admin" }).ok).toBe(false);
  });

  it("stops an admin demoting or changing an owner", () => {
    expect(change({ targetRole: "owner", newRole: "viewer", ownerCount: 2 }).ok).toBe(false);
  });

  it("lets an owner hand out ownership and demote another owner when one remains", () => {
    expect(change({ actorRole: "owner", newRole: "owner" }).ok).toBe(true);
    expect(change({ actorRole: "owner", targetRole: "owner", newRole: "admin", ownerCount: 2 }).ok).toBe(true);
  });

  it("never leaves a workspace without an owner", () => {
    expect(change({ actorRole: "owner", targetRole: "owner", newRole: "admin", ownerCount: 1 })).toEqual({ ok: false, reason: "A workspace needs at least one owner" });
  });

  it("blocks changing your own role, except an owner stepping down while another owner exists", () => {
    expect(change({ isSelf: true, targetRole: "admin", newRole: "viewer" }).ok).toBe(false);
    expect(change({ actorRole: "owner", isSelf: true, targetRole: "owner", newRole: "admin", ownerCount: 1 }).ok).toBe(false);
    expect(change({ actorRole: "owner", isSelf: true, targetRole: "owner", newRole: "admin", ownerCount: 2 }).ok).toBe(true);
  });

  it("treats a no-op as fine", () => {
    expect(change({ newRole: "sales" }).ok).toBe(true);
  });
});

describe("canInviteWithRole", () => {
  it("only owners may invite owners; admins may invite the rest", () => {
    expect(canInviteWithRole("admin", "owner").ok).toBe(false);
    expect(canInviteWithRole("admin", "admin").ok).toBe(true);
    expect(canInviteWithRole("owner", "owner").ok).toBe(true);
    expect(canInviteWithRole("sales", "viewer").ok).toBe(false);
  });
});
