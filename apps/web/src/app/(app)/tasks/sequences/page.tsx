"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { Sequence } from "@/lib/sequence-types";
import { useCurrentWorkspace } from "@/lib/use-workspace";

export default function SequencesPage() {
  const { workspaceId } = useCurrentWorkspace();
  const [sequences, setSequences] = useState<Sequence[]>([]);

  function load() {
    if (!workspaceId) return;
    apiFetch<Sequence[]>(`/sequences/${workspaceId}`).then(setSequences).catch(() => setSequences([]));
  }
  useEffect(load, [workspaceId]);

  if (!workspaceId) return <p className="text-sm text-gray-500">Log in and create a workspace first.</p>;

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Follow-up sequences</h1>
          <Link href="/tasks" className="text-sm text-brand-700">
            ← Back to tasks
          </Link>
        </div>
        <Link href="/tasks/sequences/new" className="rounded-md bg-brand px-3 py-2 text-sm font-semibold text-white">
          New sequence
        </Link>
      </div>

      <ul className="mt-4 divide-y divide-gray-100 rounded-md border border-gray-200 bg-white">
        {sequences.map((s) => (
          <li key={s.id} className="flex items-center justify-between px-4 py-3">
            <div>
              <Link href={`/tasks/sequences/${s.id}`} className="font-medium text-brand-700">
                {s.name}
              </Link>
              <p className="mt-0.5 text-xs text-gray-400">{s.steps.length} steps</p>
            </div>
            <span className="text-xs text-gray-500">{s._count?.enrollments ?? 0} active</span>
          </li>
        ))}
        {sequences.length === 0 && <li className="px-4 py-6 text-center text-sm text-gray-400">No sequences yet.</li>}
      </ul>
    </div>
  );
}
