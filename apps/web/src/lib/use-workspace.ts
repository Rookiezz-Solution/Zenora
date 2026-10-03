"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "./api";

export interface WorkspaceSummary {
  id: string;
  name: string;
}

const STORAGE_KEY = "zenora.workspaceId";

function remembered(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

// Remembers which workspace this browser is working in (agencies, and anyone
// in several workspaces). Reloading is the simplest way to make every page
// refetch for the new workspace.
export function switchWorkspace(id: string) {
  try {
    window.localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Storage blocked: the first workspace is used, as before.
  }
  window.location.assign("/dashboard");
}

// Picks the remembered workspace if the caller still belongs to it (access can
// be removed), otherwise their first.
export function useCurrentWorkspace() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<WorkspaceSummary[]>("/workspaces")
      .then((all) => {
        setWorkspaces(all);
        const saved = remembered();
        setWorkspaceId(all.find((w) => w.id === saved)?.id ?? all[0]?.id ?? null);
      })
      .catch(() => setWorkspaceId(null))
      .finally(() => setLoading(false));
  }, []);

  return { workspaceId, workspaces, loading };
}
