"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { Lead, LeadProfile, TimelineEvent } from "@/lib/lead-types";
import { useCurrentWorkspace } from "@/lib/use-workspace";

export default function LeadProfilePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { workspaceId } = useCurrentWorkspace();
  const [lead, setLead] = useState<LeadProfile | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [duplicates, setDuplicates] = useState<Lead[]>([]);
  const [noteBody, setNoteBody] = useState("");
  const [tagInput, setTagInput] = useState("");

  function load() {
    if (!workspaceId) return;
    apiFetch<LeadProfile>(`/leads/${workspaceId}/${id}`).then(setLead).catch(() => setLead(null));
    apiFetch<TimelineEvent[]>(`/leads/${workspaceId}/${id}/timeline`).then(setTimeline).catch(() => setTimeline([]));
    apiFetch<Lead[]>(`/leads/${workspaceId}/${id}/duplicates`).then(setDuplicates).catch(() => setDuplicates([]));
  }

  useEffect(load, [workspaceId, id]);

  async function addNote(e: React.FormEvent) {
    e.preventDefault();
    if (!workspaceId || !noteBody.trim()) return;
    await apiFetch(`/leads/${workspaceId}/${id}/notes`, { method: "POST", body: JSON.stringify({ body: noteBody }) });
    setNoteBody("");
    load();
  }

  async function addTag(e: React.FormEvent) {
    e.preventDefault();
    if (!workspaceId || !tagInput.trim()) return;
    await apiFetch(`/leads/${workspaceId}/${id}/tags`, { method: "POST", body: JSON.stringify({ name: tagInput.trim() }) });
    setTagInput("");
    load();
  }

  async function removeTag(tagId: string) {
    if (!workspaceId) return;
    await apiFetch(`/leads/${workspaceId}/${id}/tags/${tagId}`, { method: "DELETE" });
    load();
  }

  async function mergeInto(duplicateLeadId: string) {
    if (!workspaceId || !lead) return;
    await apiFetch(`/leads/${workspaceId}/merge`, {
      method: "POST",
      body: JSON.stringify({ primaryLeadId: lead.id, duplicateLeadId })
    });
    load();
  }

  async function remove() {
    if (!workspaceId || !confirm("Delete this lead? This cannot be undone.")) return;
    await apiFetch(`/leads/${workspaceId}/${id}`, { method: "DELETE" });
    router.push("/leads");
  }

  if (!workspaceId || !lead) {
    return <p className="text-sm text-gray-500">Loading…</p>;
  }

  return (
    <div className="grid max-w-4xl grid-cols-1 gap-6 md:grid-cols-3">
      <div className="md:col-span-2">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-gray-900">{lead.name || "Unnamed lead"}</h1>
          <button type="button" onClick={remove} className="text-sm text-red-600">
            Delete
          </button>
        </div>
        <p className="text-sm text-gray-500">
          {lead.phone || "—"} · {lead.email || "—"} · source: {lead.source || "—"}
        </p>

        {duplicates.length > 0 && (
          <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm">
            <p className="font-medium text-amber-800">Possible duplicate{duplicates.length > 1 ? "s" : ""} found</p>
            {duplicates.map((d) => (
              <div key={d.id} className="mt-1 flex items-center justify-between">
                <span>
                  {d.name || "Unnamed"} · {d.phone || d.email}
                </span>
                <button type="button" onClick={() => mergeInto(d.id)} className="text-brand-700 underline">
                  Merge into this lead
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {lead.tags.map((t) => (
            <span key={t.tag.id} className="flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
              {t.tag.name}
              <button type="button" onClick={() => removeTag(t.tag.id)} className="text-gray-400 hover:text-gray-700">
                ×
              </button>
            </span>
          ))}
          <form onSubmit={addTag} className="flex items-center gap-1">
            <input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              placeholder="Add tag"
              className="rounded-full border border-gray-300 px-2 py-0.5 text-xs"
            />
          </form>
        </div>

        <h2 className="mt-6 text-sm font-semibold text-gray-900">Timeline</h2>
        <ul className="mt-2 space-y-2">
          {timeline.map((event) => (
            <li key={`${event.type}-${event.data.id}`} className="rounded-md border border-gray-100 bg-white p-3 text-sm">
              {event.type === "note" && (
                <p>
                  <span className="font-medium">{event.data.author?.name ?? "Someone"}</span> noted: {event.data.body}
                </p>
              )}
              {event.type === "message" && (
                <p>
                  <span className="font-medium">{event.data.direction === "inbound" ? "Lead" : "Us"}</span> ({event.data.conversation.channel}):{" "}
                  {event.data.body}
                </p>
              )}
              {event.type === "task" && <p>Task: {event.data.title}</p>}
              <p className="mt-0.5 text-xs text-gray-400">{new Date(event.at).toLocaleString()}</p>
            </li>
          ))}
          {timeline.length === 0 && <p className="text-sm text-gray-400">No activity yet.</p>}
        </ul>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-gray-900">Notes</h2>
        <form onSubmit={addNote} className="mt-2 flex flex-col gap-2">
          <textarea
            value={noteBody}
            onChange={(e) => setNoteBody(e.target.value)}
            placeholder="Add a note…"
            rows={3}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <button type="submit" className="self-start rounded-md bg-brand px-3 py-1.5 text-sm font-semibold text-white">
            Add note
          </button>
        </form>
        <ul className="mt-4 space-y-2">
          {lead.notes.map((n) => (
            <li key={n.id} className="rounded-md bg-gray-50 p-2 text-sm">
              <p>{n.body}</p>
              <p className="mt-0.5 text-xs text-gray-400">
                {n.author?.name ?? "Someone"} · {new Date(n.createdAt).toLocaleString()}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
