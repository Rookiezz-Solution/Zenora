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
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);

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

  async function stageAction(run: () => Promise<unknown>, fallback: string) {
    setMenuFor(null);
    try {
      await run();
      setError(null);
      await load();
    } catch (err) {
      setError((err as ApiError).message ?? fallback);
    }
  }

  function renameStage() {
    if (!workspaceId || !pipeline || !renaming || !renaming.name.trim()) return setRenaming(null);
    const { id, name } = renaming;
    setRenaming(null);
    return stageAction(() => apiFetch(`/pipelines/${workspaceId}/${pipeline.id}/stages/${id}`, { method: "PATCH", body: JSON.stringify({ name: name.trim() }) }), "Could not rename the stage");
  }

  function moveStageBy(stageId: string, delta: -1 | 1) {
    if (!workspaceId || !pipeline) return;
    const ids = pipeline.stages.map((s) => s.id);
    const from = ids.indexOf(stageId);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= ids.length) return;
    [ids[from], ids[to]] = [ids[to]!, ids[from]!];
    return stageAction(() => apiFetch(`/pipelines/${workspaceId}/${pipeline.id}/stages/reorder`, { method: "PATCH", body: JSON.stringify({ stageIds: ids }) }), "Could not reorder the stages");
  }

  function deleteStage(stage: { id: string; name: string }) {
    if (!workspaceId || !pipeline) return;
    if (!confirm(`Delete the stage "${stage.name}"? This cannot be undone.`)) return setMenuFor(null);
    return stageAction(() => apiFetch(`/pipelines/${workspaceId}/${pipeline.id}/stages/${stage.id}`, { method: "DELETE" }), "Could not delete the stage");
  }

  // Stages marked this way count their leads as "qualified" in Ads and sources.
  async function toggleQualified(stageId: string, current: boolean) {
    if (!workspaceId || !pipeline) return;
    try {
      await apiFetch(`/pipelines/${workspaceId}/${pipeline.id}/stages/${stageId}`, { method: "PATCH", body: JSON.stringify({ countsAsQualified: !current }) });
      setError(null);
      load();
    } catch (err) {
      setError((err as ApiError).message ?? "Could not change the stage");
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
              {renaming?.id === stage.id ? (
                <input
                  autoFocus
                  value={renaming.name}
                  onChange={(e) => setRenaming({ id: stage.id, name: e.target.value })}
                  onBlur={renameStage}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") renameStage();
                    if (e.key === "Escape") setRenaming(null);
                  }}
                  className="w-32 rounded border border-gray-300 px-1 py-0.5 text-sm"
                />
              ) : (
                <h2 className="text-sm font-semibold text-gray-700">
                  {stage.name} <span className="text-gray-400">({stage.leads.length})</span>
                </h2>
              )}
              <span className="flex items-center gap-2">
                {stage.requiredFieldIds.length > 0 && (
                  <span className="text-[10px] uppercase text-amber-600" title="Requires fields on entry">
                    required fields
                  </span>
                )}
                {stage.type === "open" && (
                  <button
                    type="button"
                    onClick={() => toggleQualified(stage.id, stage.countsAsQualified)}
                    title={stage.countsAsQualified ? "Leads here count as qualified in Ads and sources (click to turn off)" : "Click to count leads in this stage as qualified in Ads and sources"}
                    className={`text-sm leading-none ${stage.countsAsQualified ? "text-amber-500" : "text-gray-300 hover:text-gray-400"}`}
                    aria-pressed={stage.countsAsQualified}
                  >
                    ★
                  </button>
                )}
                <span className="relative">
                  <button type="button" onClick={() => setMenuFor(menuFor === stage.id ? null : stage.id)} aria-label={`Options for ${stage.name}`} className="px-1 text-sm leading-none text-gray-400 hover:text-gray-600">
                    ⋯
                  </button>
                  {menuFor === stage.id && (
                    <div className="absolute right-0 z-10 mt-1 w-36 rounded-md border border-gray-200 bg-white py-1 text-xs shadow-md">
                      <button type="button" className="block w-full px-3 py-1.5 text-left hover:bg-gray-50" onClick={() => { setRenaming({ id: stage.id, name: stage.name }); setMenuFor(null); }}>
                        Rename
                      </button>
                      <button type="button" disabled={pipeline.stages[0]?.id === stage.id} className="block w-full px-3 py-1.5 text-left hover:bg-gray-50 disabled:opacity-40" onClick={() => moveStageBy(stage.id, -1)}>
                        Move left
                      </button>
                      <button type="button" disabled={pipeline.stages[pipeline.stages.length - 1]?.id === stage.id} className="block w-full px-3 py-1.5 text-left hover:bg-gray-50 disabled:opacity-40" onClick={() => moveStageBy(stage.id, 1)}>
                        Move right
                      </button>
                      <button type="button" className="block w-full px-3 py-1.5 text-left text-red-600 hover:bg-gray-50" onClick={() => deleteStage(stage)}>
                        Delete stage
                      </button>
                    </div>
                  )}
                </span>
              </span>
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
