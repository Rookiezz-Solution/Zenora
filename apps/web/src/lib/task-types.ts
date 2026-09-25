export interface Task {
  id: string;
  workspaceId: string;
  leadId: string | null;
  lead: { id: string; name: string | null; phone: string | null } | null;
  assignedToId: string | null;
  title: string;
  dueAt: string | null;
  completedAt: string | null;
  createdAt: string;
}
