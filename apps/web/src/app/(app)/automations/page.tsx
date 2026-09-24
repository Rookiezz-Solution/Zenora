"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { Automation } from "@/lib/automation-types";
import { useCurrentWorkspace } from "@/lib/use-workspace";

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  live: "bg-green-100 text-green-700",
  paused: "bg-amber-100 text-amber-700",
  scheduled: "bg-blue-100 text-blue-700"
};

export default function AutomationsListPage() {
  const { workspaceId } = useCurrentWorkspace();
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [newName, setNewName] = useState("");

  function load() {
    if (!workspaceId) return;
    apiFetch<Automation[]>(`/automations/${workspaceId}`).then(setAutomations).catch(() => setAutomations([]));
  }
  useEffect(load, [workspaceId]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!workspaceId || !newName.trim()) return;
    const created = await apiFetch<Automation>(`/automations/${workspaceId}`, {
      method: "POST",
      body: JSON.stringify({ name: newName.trim() })
    });
    window.location.href = `/automations/${created.id}`;
  }

  if (!workspaceId) return <p className="text-sm text-gray-500">Log in and create a workspace first.</p>;

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Automations</h1>
      </div>

      <form onSubmit={create} className="mt-4 flex gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New automation name"
          className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
        <button type="submit" className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white">
          Create
        </button>
      </form>

      <ul className="mt-4 divide-y divide-gray-100 rounded-md border border-gray-200 bg-white">
        {automations.map((a) => (
          <li key={a.id} className="flex items-center justify-between px-4 py-3">
            <Link href={`/automations/${a.id}`} className="flex items-center gap-2">
              <span className="font-medium text-gray-900">{a.name}</span>
              <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLES[a.status] ?? "bg-gray-100 text-gray-600"}`}>
                {a.status}
              </span>
            </Link>
            <span className="text-xs text-gray-400">{a.runCount ?? 0} runs</span>
          </li>
        ))}
        {automations.length === 0 && <li className="px-4 py-6 text-center text-sm text-gray-400">No automations yet.</li>}
      </ul>
    </div>
  );
}
