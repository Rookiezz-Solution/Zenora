"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { Sequence } from "@/lib/sequence-types";
import { useCurrentWorkspace } from "@/lib/use-workspace";

export default function SequenceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { workspaceId } = useCurrentWorkspace();
  const [sequence, setSequence] = useState<Sequence | null>(null);

  function load() {
    if (!workspaceId) return;
    apiFetch<Sequence>(`/sequences/${workspaceId}/${id}`).then(setSequence).catch(() => setSequence(null));
  }
  useEffect(load, [workspaceId, id]);

  async function stopEnrollment(leadId: string) {
    if (!workspaceId) return;
    await apiFetch(`/sequences/${workspaceId}/${id}/leads/${leadId}/stop`, { method: "POST" });
    load();
  }

  if (!workspaceId || !sequence) return <p className="text-sm text-gray-500">Loading…</p>;

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-semibold text-gray-900">{sequence.name}</h1>
      <Link href="/tasks/sequences" className="text-sm text-brand-700">
        ← Back to sequences
      </Link>

      <div className="mt-4 rounded-md border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-900">Steps</h2>
        <ol className="mt-2 space-y-2 text-sm">
          {sequence.steps.map((step, i) => (
            <li key={i} className="rounded-md bg-gray-50 p-2">
              <span className="text-xs text-gray-400">Wait {step.waitHours}h, then</span>{" "}
              {step.action.type === "send_text" && <span>send: “{step.action.body}”</span>}
              {step.action.type === "tag" && <span>tag as “{step.action.tagName}”</span>}
              {step.action.type === "create_task" && <span>create task: “{step.action.title}”</span>}
            </li>
          ))}
        </ol>
      </div>

      <div className="mt-4">
        <h2 className="text-sm font-semibold text-gray-900">Enrolled leads</h2>
        <ul className="mt-2 divide-y divide-gray-100 rounded-md border border-gray-200 bg-white">
          {sequence.enrollments?.map((e) => (
            <li key={e.id} className="flex items-center justify-between px-4 py-2 text-sm">
              <div>
                <Link href={`/leads/${e.leadId}`} className="text-brand-700">
                  {e.lead.name || e.lead.phone || e.leadId}
                </Link>
                <span className="ml-2 text-xs text-gray-400">
                  step {e.currentStep + 1}/{sequence.steps.length} · {e.status}
                </span>
              </div>
              {e.status === "active" && (
                <button type="button" onClick={() => stopEnrollment(e.leadId)} className="text-xs text-red-600">
                  Stop
                </button>
              )}
            </li>
          ))}
          {(!sequence.enrollments || sequence.enrollments.length === 0) && (
            <li className="px-4 py-6 text-center text-sm text-gray-400">No leads enrolled yet.</li>
          )}
        </ul>
      </div>
    </div>
  );
}
