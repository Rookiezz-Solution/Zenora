export interface AgencyMemberRow {
  userId: string;
  role: "owner" | "admin";
  email: string;
  name: string | null;
}

export interface MyAgency {
  id: string;
  name: string;
  role: "owner" | "admin";
  members: AgencyMemberRow[];
}

export interface ClientRow {
  id: string;
  name: string;
  industry: string | null;
  planId: string;
  leads: number;
  newLeads7d: number;
  openTasks: number;
  overdueTasks: number;
}

export interface ManagedBy {
  agency: { id: string; name: string } | null;
  people: { email: string; name: string | null; role: string }[];
}
