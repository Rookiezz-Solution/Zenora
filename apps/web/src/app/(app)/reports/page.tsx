"use client";

import Papa from "papaparse";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { Pipeline } from "@/lib/pipeline-types";
import type { BotDropoff, LostReasonRow, PipelineFunnel, TeamPerformanceRow } from "@/lib/report-types";
import { useCurrentWorkspace } from "@/lib/use-workspace";
import { NoWorkspace } from "@/components/no-workspace";

function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  if (rows.length === 0) return;
  const csv = Papa.unparse(rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function ExportButton({ label, rows, filename }: { label: string; rows: Record<string, unknown>[]; filename: string }) {
  return (
    <button
      type="button"
      onClick={() => downloadCsv(filename, rows)}
      disabled={rows.length === 0}
      className="rounded-md border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 disabled:opacity-50"
    >
      {label}
    </button>
  );
}

export default function ReportsPage() {
  const { workspaceId, loading: workspaceLoading } = useCurrentWorkspace();
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [selectedPipelineId, setSelectedPipelineId] = useState("");
  const [funnel, setFunnel] = useState<PipelineFunnel | null>(null);
  const [dropoff, setDropoff] = useState<BotDropoff | null>(null);
  const [team, setTeam] = useState<TeamPerformanceRow[]>([]);
  const [lostReasons, setLostReasons] = useState<LostReasonRow[]>([]);

  useEffect(() => {
    if (!workspaceId) return;
    apiFetch<Pipeline[]>(`/pipelines/${workspaceId}`).then(setPipelines).catch(() => setPipelines([]));
    apiFetch<BotDropoff>(`/reports/${workspaceId}/bot-dropoff`).then(setDropoff).catch(() => setDropoff(null));
    apiFetch<TeamPerformanceRow[]>(`/reports/${workspaceId}/team-performance`).then(setTeam).catch(() => setTeam([]));
    apiFetch<LostReasonRow[]>(`/reports/${workspaceId}/lost-reasons`).then(setLostReasons).catch(() => setLostReasons([]));
  }, [workspaceId]);

  useEffect(() => {
    if (!workspaceId) return;
    const query = selectedPipelineId ? `?pipelineId=${selectedPipelineId}` : "";
    apiFetch<PipelineFunnel>(`/reports/${workspaceId}/funnel${query}`).then(setFunnel).catch(() => setFunnel(null));
  }, [workspaceId, selectedPipelineId]);

  if (!workspaceId) return <NoWorkspace loading={workspaceLoading} />;

  const maxFunnelCount = Math.max(1, ...(funnel?.stages.map((s) => s.count) ?? [0]));

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold text-gray-900">Reports</h1>
      <p className="mt-1 text-sm text-gray-500">Pipeline funnel, bot drop-off, team performance and lost reasons.</p>

      <section className="mt-6 rounded-md border border-gray-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">Pipeline funnel</h2>
          <div className="flex items-center gap-2">
            {pipelines.length > 1 && (
              <select
                value={selectedPipelineId}
                onChange={(e) => setSelectedPipelineId(e.target.value)}
                className="rounded-md border border-gray-300 px-2 py-1 text-xs"
              >
                {pipelines.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            )}
            <ExportButton
              label="Export CSV"
              filename="pipeline-funnel.csv"
              rows={(funnel?.stages ?? []).map((s) => ({ stage: s.name, type: s.type, leads: s.count }))}
            />
          </div>
        </div>
        <p className="mt-1 text-xs text-gray-400">Leads currently in each stage — a snapshot, not a historical conversion rate.</p>
        <div className="mt-3 space-y-2">
          {(funnel?.stages ?? []).map((s) => (
            <div key={s.stageId}>
              <div className="flex justify-between text-xs text-gray-600">
                <span>{s.name}</span>
                <span>{s.count}</span>
              </div>
              <div className="mt-0.5 h-2 rounded-full bg-gray-100">
                <div
                  className={`h-2 rounded-full ${s.type === "won" ? "bg-green-500" : s.type === "lost" ? "bg-red-400" : "bg-brand"}`}
                  style={{ width: `${(s.count / maxFunnelCount) * 100}%` }}
                />
              </div>
            </div>
          ))}
          {funnel && funnel.stages.length === 0 && <p className="text-sm text-gray-400">No stages yet.</p>}
        </div>
      </section>

      <section className="mt-4 rounded-md border border-gray-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">Bot drop-off</h2>
          <ExportButton
            label="Export CSV"
            filename="bot-dropoff.csv"
            rows={(dropoff?.stepFunnel ?? []).map((s) => ({ block: s.blockId, type: s.type, status: s.status, count: s.count }))}
          />
        </div>
        <p className="mt-1 text-xs text-gray-400">Automation run outcomes and per-step status, across every bot.</p>
        <div className="mt-3 flex flex-wrap gap-3 text-xs">
          {(dropoff?.runsByStatus ?? []).map((r) => (
            <span key={r.status} className="rounded-full bg-gray-100 px-2 py-1">
              {r.status}: <span className="font-medium">{r.count}</span>
            </span>
          ))}
          {dropoff && dropoff.runsByStatus.length === 0 && <p className="text-sm text-gray-400">No automation runs yet.</p>}
        </div>
        <table className="mt-3 w-full text-left text-xs">
          <thead>
            <tr className="text-gray-400">
              <th className="pb-1 font-normal">Block</th>
              <th className="pb-1 font-normal">Type</th>
              <th className="pb-1 font-normal">Status</th>
              <th className="pb-1 font-normal text-right">Count</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {(dropoff?.stepFunnel ?? []).map((s, i) => (
              <tr key={`${s.blockId}-${s.type}-${s.status}-${i}`}>
                <td className="py-1">{s.blockId}</td>
                <td className="py-1">{s.type}</td>
                <td className={`py-1 ${s.status === "error" ? "text-red-600" : ""}`}>{s.status}</td>
                <td className="py-1 text-right">{s.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="mt-4 rounded-md border border-gray-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">Team performance</h2>
          <ExportButton
            label="Export CSV"
            filename="team-performance.csv"
            rows={team.map((t) => ({
              name: t.name ?? t.email,
              role: t.role,
              totalLeads: t.totalLeads,
              won: t.won,
              lost: t.lost,
              avgResponseMinutes: t.avgResponseMinutes ?? ""
            }))}
          />
        </div>
        <table className="mt-3 w-full text-left text-xs">
          <thead>
            <tr className="text-gray-400">
              <th className="pb-1 font-normal">Rep</th>
              <th className="pb-1 font-normal text-right">Leads</th>
              <th className="pb-1 font-normal text-right">Won</th>
              <th className="pb-1 font-normal text-right">Lost</th>
              <th className="pb-1 font-normal text-right">Avg. response</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {team.map((t) => (
              <tr key={t.userId}>
                <td className="py-1">
                  {t.name ?? t.email} <span className="text-gray-400">({t.role})</span>
                </td>
                <td className="py-1 text-right">{t.totalLeads}</td>
                <td className="py-1 text-right">{t.won}</td>
                <td className="py-1 text-right">{t.lost}</td>
                <td className="py-1 text-right">{t.avgResponseMinutes !== null ? `${t.avgResponseMinutes} min` : "—"}</td>
              </tr>
            ))}
            {team.length === 0 && (
              <tr>
                <td colSpan={5} className="py-3 text-center text-gray-400">
                  No team members yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="mt-4 rounded-md border border-gray-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">Lost reasons</h2>
          <ExportButton label="Export CSV" filename="lost-reasons.csv" rows={lostReasons.map((r) => ({ reason: r.reason, count: r.count }))} />
        </div>
        <ul className="mt-3 divide-y divide-gray-100 text-sm">
          {lostReasons.map((r) => (
            <li key={r.reason} className="flex justify-between py-1.5">
              <span>{r.reason}</span>
              <span className="font-medium text-gray-900">{r.count}</span>
            </li>
          ))}
          {lostReasons.length === 0 && <li className="py-2 text-sm text-gray-400">No lost leads yet.</li>}
        </ul>
      </section>
    </div>
  );
}
