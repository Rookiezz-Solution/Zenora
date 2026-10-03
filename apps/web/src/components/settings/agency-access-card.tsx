"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, type ApiError } from "@/lib/api";
import type { ManagedBy } from "@/lib/agency-types";

// Shown only when an agency manages this workspace: who has access because of
// it, and a way for the workspace's own owner to take it back.
export function AgencyAccessCard({ workspaceId }: { workspaceId: string }) {
  const [info, setInfo] = useState<ManagedBy | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(() => {
    apiFetch<ManagedBy>(`/agencies/workspace/${workspaceId}`).then(setInfo).catch(() => setInfo(null));
  }, [workspaceId]);
  useEffect(load, [load]);

  if (!info?.agency) return null;

  async function revoke() {
    if (!window.confirm(`Remove ${info?.agency?.name}'s access to this workspace? They will no longer be able to open it.`)) return;
    setMessage(null);
    try {
      await apiFetch(`/agencies/workspace/${workspaceId}`, { method: "DELETE" });
      load();
    } catch (err) {
      setMessage((err as ApiError).message ?? "Could not remove the agency");
    }
  }

  return (
    <section className="mb-6 rounded-md border border-amber-200 bg-amber-50 p-4">
      <h2 className="text-sm font-semibold text-amber-900">Managed by {info.agency.name}</h2>
      <p className="mt-1 text-xs text-amber-800">These people have access because of the agency:</p>
      <ul className="mt-1 text-xs text-amber-900">
        {info.people.map((p) => (
          <li key={p.email}>
            {p.name ?? p.email} · {p.role}
          </li>
        ))}
      </ul>
      {message && <p className="mt-2 text-xs text-red-700">{message}</p>}
      <button type="button" onClick={revoke} className="mt-3 rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900">
        Remove agency access
      </button>
    </section>
  );
}
