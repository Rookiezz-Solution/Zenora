"use client";

import { useEffect, useState } from "react";
import { MoveStageForm } from "@/components/pipeline/move-stage-form";
import { apiFetch, type ApiError } from "@/lib/api";
import type { CustomField, Pipeline } from "@/lib/pipeline-types";
import { useCurrentWorkspace } from "@/lib/use-workspace";

interface PendingMove {
  leadId: string;
  stageId: string;
  stageName: string;
  missingFields: CustomField[];
}

interface PendingLostMove {
  leadId: string;
  stageId: string;
  stageName: string;
}

export default function PipelinePage() {
  const { workspaceId } = useCurrentWorkspace();
  const [pipeline, setPipeline] = useState<Pipeline | null>(null);
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null);
  const [pendingLostMove, setPendingLostMove] = useState<PendingLostMove | null>(null);
  const [lostReason, setLostReason] = useState("");
  const [newStageName, setNewStageName] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!workspaceId) return;
    const pipelines = await apiFetch<Pipeline[]>(`/pipelines/${workspaceId}`).catch(() => []);
    let active = pipelines[0];
    if (!active) {
      active = await apiFetch<Pipeline>(`/pipelines/${workspaceId}`, {
        method: "POST",
        body: JSON.stringify({ name: "Sales Pipeline", isDefault: true })
      });
    }
    const board = await apiFetch<Pipeline>(`/pipelines/${workspaceId}/${active.id}/board`);
    setPipeline(board);
  }

  useEffect(() => {
    load();
  }, [workspaceId]);

  async function moveLead(leadId: string, stageId: string, stageName: string, fieldValues?: Record<string, string>, reason?: string) {
    if (!workspaceId) return;
    setError(null);
    try {
      await apiFetch(`/leads/${workspaceId}/${leadId}/move-stage`, {
        method: "POST",
        body: JSON.stringify({ stageId, fieldValues, lostReason: reason })
      });
      setPendingMove(null);
      setPendingLostMove(null);
      setLostReason("");
      load();
    } catch (err) {
      const apiErr = err as ApiError;
      const body = apiErr.body as { missingFields?: CustomField[] } | undefined;
      if (apiErr.status === 409 && body?.missingFields) {
        setPendingMove({ leadId, stageId, stageName, missingFields: body.missingFields });
      } else {
        setError(apiErr.message);
      }
    }
  }

  function onDrop(e: React.DragEvent, stageId: string, stageName: string, stageType: "open" | "won" | "lost") {
    e.preventDefault();
    const leadId = e.dataTransfer.getData("text/lead-id");
    if (!leadId) return;
    if (stageType === "lost") {
      setPendingLostMove({ leadId, stageId, stageName });
    } else {
      moveLead(leadId, stageId, stageName);
    }
  }

  async function addStage(e: React.FormEvent) {
    e.preventDefault();
    if (!workspaceId || !pipeline || !newStageName.trim()) return;
    await apiFetch(`/pipelines/${workspaceId}/${pipeline.id}/stages`, {
      method: "POST",
      body: JSON.stringify({ name: newStageName.trim() })
    });
    setNewStageName("");
    load();
  }

  if (!workspaceId) return <p className="text-sm text-gray-500">Log in and create a workspace first.</p>;
  if (!pipeline) return <p className="text-sm text-gray-500">Loading…</p>;

  return (
    <div className="-m-6 flex h-full flex-col">
      <div className="border-b border-gray-200 bg-white px-6 py-3">
        <h1 className="text-xl font-semibold text-gray-900">{pipeline.name}</h1>
        {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
      </div>

      <div className="flex flex-1 gap-4 overflow-x-auto p-6">
        {pipeline.stages.map((stage) => (
          <div
            key={stage.id}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => onDrop(e, stage.id, stage.name, stage.type)}
            className="flex w-64 shrink-0 flex-col rounded-md bg-gray-100"
          >
            <div className="flex items-center justify-between px-3 py-2">
              <h2 className="text-sm font-semibold text-gray-700">
                {stage.name} <span className="text-gray-400">({stage.leads.length})</span>
              </h2>
              {stage.requiredFieldIds.length > 0 && (
                <span className="text-[10px] uppercase text-amber-600" title="Requires fields on entry">
                  required fields
                </span>
              )}
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto px-2 pb-2">
              {stage.leads.map((lead) => (
                <div
                  key={lead.id}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData("text/lead-id", lead.id)}
                  className="cursor-move rounded-md bg-white p-3 text-sm shadow-sm"
                >
                  <p className="font-medium text-gray-900">{lead.name || lead.phone || lead.email || "Unnamed"}</p>
                  {lead.tags.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {lead.tags.map((t) => (
                        <span key={t.tag.id} className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600">
                          {t.tag.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}

        <form onSubmit={addStage} className="flex w-64 shrink-0 flex-col gap-2 rounded-md border border-dashed border-gray-300 p-3">
          <input
            value={newStageName}
            onChange={(e) => setNewStageName(e.target.value)}
            placeholder="New stage name"
            className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
          />
          <button type="submit" className="rounded-md bg-brand px-3 py-1.5 text-sm font-semibold text-white">
            Add stage
          </button>
        </form>
      </div>

      {pendingMove && (
        <MoveStageForm
          stageName={pendingMove.stageName}
          fields={pendingMove.missingFields}
          onCancel={() => setPendingMove(null)}
          onSubmit={(values) => moveLead(pendingMove.leadId, pendingMove.stageId, pendingMove.stageName, values)}
        />
      )}

      {pendingLostMove && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl">
            <h2 className="text-sm font-semibold text-gray-900">Moving to &quot;{pendingLostMove.stageName}&quot;</h2>
            <p className="mt-1 text-xs text-gray-500">Why was this lead lost? (Feeds the Reports page.)</p>
            <textarea
              value={lostReason}
              onChange={(e) => setLostReason(e.target.value)}
              placeholder="e.g. Went with a competitor, budget, unresponsive…"
              rows={3}
              className="mt-3 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setPendingLostMove(null);
                  setLostReason("");
                }}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => moveLead(pendingLostMove.leadId, pendingLostMove.stageId, pendingLostMove.stageName, undefined, lostReason.trim() || undefined)}
                className="rounded-md bg-brand px-3 py-1.5 text-sm font-semibold text-white"
              >
                Move
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
