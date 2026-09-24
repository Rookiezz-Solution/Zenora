export interface Tag {
  id: string;
  name: string;
}

export interface BoardLead {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  tags: { tag: Tag }[];
}

export interface Stage {
  id: string;
  pipelineId: string;
  name: string;
  type: "open" | "won" | "lost";
  order: number;
  requiredFieldIds: string[];
  leads: BoardLead[];
}

export interface Pipeline {
  id: string;
  workspaceId: string;
  name: string;
  isDefault: boolean;
  stages: Stage[];
}

export interface CustomField {
  id: string;
  key: string;
  label: string;
  type: "text" | "number" | "date" | "select" | "multiselect" | "boolean";
  options: string[] | null;
  required: boolean;
}
