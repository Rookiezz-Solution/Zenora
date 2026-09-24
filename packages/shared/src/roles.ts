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
  "audit_log.read"
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
    "reports.read"
  ],
  sales: ["leads.read", "leads.write", "reports.read"],
  viewer: ["leads.read", "reports.read"]
};

export function roleHasPermission(role: WorkspaceRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
