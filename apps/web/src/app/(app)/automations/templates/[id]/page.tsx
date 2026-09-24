"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { FlowBlockEditor } from "@/components/automations/flow-block-editor";
import { apiFetch, type ApiError } from "@/lib/api";
import type { FlowGraph, FlowTemplate } from "@/lib/automation-types";
import type { Pipeline } from "@/lib/pipeline-types";
import { useCurrentWorkspace } from "@/lib/use-workspace";

interface Member {
  id: string;
  user: { id: string; name: string | null; email: string };
}

export default function FlowTemplateEditorPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { workspaceId } = useCurrentWorkspace();
  const [template, setTemplate] = useState<FlowTemplate | null>(null);
  const [stages, setStages] = useState<{ id: string; name: string }[]>([]);
  const [members, setMembers] = useState<{ id: string; name: string | null; email: string }[]>([]);
  const [pendingGraph, setPendingGraph] = useState<FlowGraph | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!workspaceId) return;
    apiFetch<FlowTemplate>(`/flow-templates/${workspaceId}/${id}`).then(setTemplate).catch(() => setTemplate(null));
    apiFetch<Pipeline[]>(`/pipelines/${workspaceId}`)
      .then((pipelines) => setStages(pipelines.flatMap((p) => p.stages.map((s) => ({ id: s.id, name: s.name })))))
      .catch(() => setStages([]));
    apiFetch<Member[]>(`/workspaces/${workspaceId}/members`)
      .then((rows) => setMembers(rows.map((m) => ({ id: m.user.id, name: m.user.name, email: m.user.email }))))
      .catch(() => setMembers([]));
  }, [workspaceId, id]);

  async function save() {
    if (!workspaceId || !pendingGraph) return;
    setMessage(null);
    try {
      await apiFetch(`/flow-templates/${workspaceId}/${id}`, { method: "PATCH", body: JSON.stringify({ graph: pendingGraph }) });
      setMessage("Saved.");
    } catch (err) {
      setMessage((err as ApiError).message);
    }
  }

  async function remove() {
    if (!workspaceId || !confirm("Delete this template?")) return;
    await apiFetch(`/flow-templates/${workspaceId}/${id}`, { method: "DELETE" });
    router.push("/automations/templates");
  }

  if (!workspaceId || !template) return <p className="text-sm text-gray-500">Loading…</p>;

  const isPublic = !template.workspaceId;

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">{template.name}</h1>
        {!isPublic && (
          <div className="flex gap-2">
            <button type="button" onClick={save} className="rounded-md bg-brand px-3 py-1.5 text-sm font-semibold text-white">
              Save
            </button>
            <button type="button" onClick={remove} className="rounded-md border border-red-200 px-3 py-1.5 text-sm text-red-600">
              Delete
            </button>
          </div>
        )}
      </div>
      {isPublic && <p className="mt-1 text-sm text-amber-600">This is a public starter template — view only.</p>}
      {message && <p className="mt-2 text-sm text-gray-600">{message}</p>}

      <div className="mt-4">
        <FlowBlockEditor initialGraph={template.graph} stages={stages} members={members} onChange={setPendingGraph} />
      </div>
    </div>
  );
}
