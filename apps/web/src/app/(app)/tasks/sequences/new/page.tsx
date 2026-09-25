"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "@/lib/api";
import type { Sequence, SequenceAction, SequenceStep } from "@/lib/sequence-types";
import { useCurrentWorkspace } from "@/lib/use-workspace";

const EMPTY_STEP: SequenceStep = { waitHours: 1, action: { type: "send_text", body: "" } };

export default function NewSequencePage() {
  const { workspaceId } = useCurrentWorkspace();
  const router = useRouter();
  const [name, setName] = useState("");
  const [steps, setSteps] = useState<SequenceStep[]>([{ ...EMPTY_STEP }]);
  const [error, setError] = useState<string | null>(null);

  function updateStep(index: number, patch: Partial<SequenceStep>) {
    setSteps((s) => s.map((step, i) => (i === index ? { ...step, ...patch } : step)));
  }

  function updateAction(index: number, action: SequenceAction) {
    updateStep(index, { action });
  }

  function addStep() {
    setSteps((s) => [...s, { ...EMPTY_STEP }]);
  }

  function removeStep(index: number) {
    setSteps((s) => s.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!workspaceId || !name.trim()) return;
    setError(null);
    try {
      const sequence = await apiFetch<Sequence>(`/sequences/${workspaceId}`, {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), steps })
      });
      router.push(`/tasks/sequences/${sequence.id}`);
    } catch (err) {
      setError((err as { message?: string }).message ?? "Could not create sequence");
    }
  }

  if (!workspaceId) return <p className="text-sm text-gray-500">Log in and create a workspace first.</p>;

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-semibold text-gray-900">New sequence</h1>
      <Link href="/tasks/sequences" className="text-sm text-brand-700">
        ← Back to sequences
      </Link>

      <form onSubmit={handleSubmit} className="mt-4 space-y-4 rounded-md border border-gray-200 bg-white p-4">
        <label className="block text-sm">
          <span className="text-gray-500">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. New lead follow-up"
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </label>

        <div className="space-y-3">
          {steps.map((step, i) => (
            <div key={i} className="rounded-md border border-gray-100 bg-gray-50 p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-500">Step {i + 1}</span>
                {steps.length > 1 && (
                  <button type="button" onClick={() => removeStep(i)} className="text-xs text-red-600">
                    Remove
                  </button>
                )}
              </div>
              <div className="mt-2 flex items-center gap-2 text-sm">
                <span className="text-gray-500">Wait</span>
                <input
                  type="number"
                  min={0}
                  value={step.waitHours}
                  onChange={(e) => updateStep(i, { waitHours: Number(e.target.value) })}
                  className="w-16 rounded-md border border-gray-300 px-2 py-1 text-sm"
                />
                <span className="text-gray-500">hours, then</span>
                <select
                  value={step.action.type}
                  onChange={(e) => {
                    const type = e.target.value as SequenceAction["type"];
                    updateAction(i, type === "send_text" ? { type, body: "" } : type === "tag" ? { type, tagName: "" } : { type, title: "" });
                  }}
                  className="rounded-md border border-gray-300 px-2 py-1 text-sm"
                >
                  <option value="send_text">Send a message</option>
                  <option value="tag">Add a tag</option>
                  <option value="create_task">Create a task</option>
                </select>
              </div>
              {step.action.type === "send_text" && (
                <textarea
                  value={step.action.body}
                  onChange={(e) => updateAction(i, { type: "send_text", body: e.target.value })}
                  placeholder="Message body"
                  rows={2}
                  className="mt-2 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                />
              )}
              {step.action.type === "tag" && (
                <input
                  value={step.action.tagName}
                  onChange={(e) => updateAction(i, { type: "tag", tagName: e.target.value })}
                  placeholder="Tag name"
                  className="mt-2 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                />
              )}
              {step.action.type === "create_task" && (
                <input
                  value={step.action.title}
                  onChange={(e) => updateAction(i, { type: "create_task", title: e.target.value })}
                  placeholder="Task title"
                  className="mt-2 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                />
              )}
            </div>
          ))}
        </div>
        <button type="button" onClick={addStep} className="text-sm font-medium text-brand-700">
          + Add step
        </button>

        {error && <p className="text-sm text-red-600">{error}</p>}
        <div>
          <button type="submit" className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white">
            Create sequence
          </button>
        </div>
      </form>
    </div>
  );
}
