"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { Task } from "@/lib/task-types";
import { useCurrentWorkspace } from "@/lib/use-workspace";

export default function TasksPage() {
  const { workspaceId } = useCurrentWorkspace();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [showCompleted, setShowCompleted] = useState(false);
  const [title, setTitle] = useState("");
  const [dueAt, setDueAt] = useState("");

  function load() {
    if (!workspaceId) return;
    const query = showCompleted ? "" : "?completed=false";
    apiFetch<Task[]>(`/tasks/${workspaceId}${query}`).then(setTasks).catch(() => setTasks([]));
  }
  useEffect(load, [workspaceId, showCompleted]);

  async function addTask(e: React.FormEvent) {
    e.preventDefault();
    if (!workspaceId || !title.trim()) return;
    await apiFetch(`/tasks/${workspaceId}`, {
      method: "POST",
      body: JSON.stringify({ title: title.trim(), ...(dueAt ? { dueAt: new Date(dueAt).toISOString() } : {}) })
    });
    setTitle("");
    setDueAt("");
    load();
  }

  async function toggleComplete(task: Task) {
    if (!workspaceId) return;
    await apiFetch(`/tasks/${workspaceId}/${task.id}`, {
      method: "PATCH",
      body: JSON.stringify({ completed: !task.completedAt })
    });
    load();
  }

  async function remove(id: string) {
    if (!workspaceId) return;
    await apiFetch(`/tasks/${workspaceId}/${id}`, { method: "DELETE" });
    load();
  }

  if (!workspaceId) return <p className="text-sm text-gray-500">Log in and create a workspace first.</p>;

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Tasks and follow-ups</h1>
          <Link href="/tasks/sequences" className="text-sm text-brand-700">
            Manage follow-up sequences →
          </Link>
        </div>
        <label className="flex items-center gap-1 text-xs text-gray-500">
          <input type="checkbox" checked={showCompleted} onChange={(e) => setShowCompleted(e.target.checked)} />
          Show completed
        </label>
      </div>

      <form onSubmit={addTask} className="mt-4 flex flex-wrap items-center gap-2 rounded-md border border-gray-200 bg-white p-4">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="New task…"
          className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
        <input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} className="rounded-md border border-gray-300 px-3 py-2 text-sm" />
        <button type="submit" className="rounded-md bg-brand px-3 py-2 text-sm font-semibold text-white">
          Add
        </button>
      </form>

      <ul className="mt-4 divide-y divide-gray-100 rounded-md border border-gray-200 bg-white">
        {tasks.map((t) => (
          <li key={t.id} className="flex items-center justify-between px-4 py-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={!!t.completedAt} onChange={() => toggleComplete(t)} />
              <span className={t.completedAt ? "text-gray-400 line-through" : "text-gray-900"}>{t.title}</span>
            </label>
            <div className="flex items-center gap-3 text-xs text-gray-400">
              {t.lead && (
                <Link href={`/leads/${t.lead.id}`} className="text-brand-700">
                  {t.lead.name || t.lead.phone}
                </Link>
              )}
              {t.dueAt && <span>{new Date(t.dueAt).toLocaleString()}</span>}
              <button type="button" onClick={() => remove(t.id)} className="text-red-600">
                Remove
              </button>
            </div>
          </li>
        ))}
        {tasks.length === 0 && <li className="px-4 py-6 text-center text-sm text-gray-400">No tasks yet.</li>}
      </ul>
    </div>
  );
}
