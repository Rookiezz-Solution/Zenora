"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "./api";

interface Workspace {
  id: string;
  name: string;
}

// Phase 0/1 simplification: always uses the caller's first workspace. A
// workspace switcher (multi-workspace for partners, per docs/PRD.md) lands
// with Phase 3's agency support.
export function useCurrentWorkspace() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<Workspace[]>("/workspaces")
      .then((ws) => setWorkspaceId(ws[0]?.id ?? null))
      .catch(() => setWorkspaceId(null))
      .finally(() => setLoading(false));
  }, []);

  return { workspaceId, loading };
}
