export const WORKSPACE_ROLES = ["owner", "admin", "manager", "sales", "viewer"] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

export const PERMISSIONS = [
  "workspace.manage",
  "billing.manage",
  "members.manage",
  "channels.manage",
  "pipelines.manage",
  "leads.read",
  "leads.write",
  "leads.delete",
  "automations.manage",
  "broadcasts.send",
  "reports.read",
  "settings.manage",
  "audit_log.read",
  "routing.manage",
  "tasks.manage",
  "knowledge.manage"
] as const;
export type Permission = (typeof PERMISSIONS)[number];

// Non-negotiable: every permission check is scoped to a workspace_id — this
// matrix never grants cross-workspace access on its own.
export const ROLE_PERMISSIONS: Record<WorkspaceRole, readonly Permission[]> = {
  owner: PERMISSIONS,
  admin: PERMISSIONS.filter((p) => p !== "billing.manage" && p !== "workspace.manage"),
  manager: [
    "leads.read",
    "leads.write",
    "pipelines.manage",
    "automations.manage",
    "broadcasts.send",
    "reports.read",
    "routing.manage",
    "tasks.manage",
    "knowledge.manage"
  ],
  sales: ["leads.read", "leads.write", "reports.read", "tasks.manage"],
  viewer: ["leads.read", "reports.read"]
};

export function roleHasPermission(role: WorkspaceRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export type RoleDecision = { ok: true } | { ok: false; reason: string };

// Who may set a member's role. Owners are the only ones allowed to hand out or
// take away ownership, nobody may promote themselves, and a workspace can't be
// left without an owner. (Admins hold `members.manage`, which on its own would
// let them make themselves owner and take over billing.)
export function canChangeMemberRole(input: {
  actorRole: WorkspaceRole;
  targetRole: WorkspaceRole;
  newRole: WorkspaceRole;
  isSelf: boolean;
  ownerCount: number;
}): RoleDecision {
  const { actorRole, targetRole, newRole, isSelf, ownerCount } = input;
  if (actorRole !== "owner" && actorRole !== "admin") return { ok: false, reason: "You can't change roles" };
  if (newRole === targetRole) return { ok: true };

  if (isSelf) {
    // The only self-change allowed is an owner stepping down while another owner remains.
    if (!(actorRole === "owner" && ownerCount > 1)) return { ok: false, reason: "You can't change your own role" };
    return { ok: true };
  }
  if ((newRole === "owner" || targetRole === "owner") && actorRole !== "owner") return { ok: false, reason: "Only an owner can grant or change the owner role" };
  if (targetRole === "owner" && ownerCount <= 1) return { ok: false, reason: "A workspace needs at least one owner" };
  return { ok: true };
}

// Inviting someone as owner hands over the keys, so only an owner may.
export function canInviteWithRole(actorRole: WorkspaceRole, role: WorkspaceRole): RoleDecision {
  if (actorRole !== "owner" && actorRole !== "admin") return { ok: false, reason: "You can't invite people" };
  if (role === "owner" && actorRole !== "owner") return { ok: false, reason: "Only an owner can invite another owner" };
  return { ok: true };
}
