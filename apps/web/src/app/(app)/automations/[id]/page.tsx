"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { FlowBlockEditor } from "@/components/automations/flow-block-editor";
import { apiFetch, type ApiError } from "@/lib/api";
import type { Automation, AutomationStats, AutomationVersion, FlowGraph, TestRunResult } from "@/lib/automation-types";
import type { Pipeline } from "@/lib/pipeline-types";
import { useCurrentWorkspace } from "@/lib/use-workspace";

type Tab = "build" | "test" | "versions" | "stats";

interface Member {
  id: string;
  user: { id: string; name: string | null; email: string };
}

export default function AutomationEditorPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { workspaceId } = useCurrentWorkspace();
  const [automation, setAutomation] = useState<Automation | null>(null);
  const [stages, setStages] = useState<{ id: string; name: string }[]>([]);
  const [members, setMembers] = useState<{ id: string; name: string | null; email: string }[]>([]);
  const [tab, setTab] = useState<Tab>("build");
  const [pendingGraph, setPendingGraph] = useState<FlowGraph | null>(null);
  const [channel, setChannel] = useState<"instagram" | "whatsapp">("whatsapp");
  const [keywords, setKeywords] = useState("");
  const [matchType, setMatchType] = useState<"contains" | "exact" | "any">("contains");
  const [message, setMessage] = useState<string | null>(null);

  function load() {
    if (!workspaceId) return;
    apiFetch<Automation>(`/automations/${workspaceId}/${id}`).then((a) => {
      setAutomation(a);
      if (a.trigger) {
        setChannel(a.trigger.type === "instagram_dm_keyword" ? "instagram" : "whatsapp");
        setKeywords(a.trigger.config.keywords.join(", "));
        setMatchType(a.trigger.config.matchType as "contains" | "exact" | "any");
      }
    });
  }
  useEffect(load, [workspaceId, id]);

  useEffect(() => {
    if (!workspaceId) return;
    apiFetch<Pipeline[]>(`/pipelines/${workspaceId}`)
      .then((pipelines) => setStages(pipelines.flatMap((p) => p.stages.map((s) => ({ id: s.id, name: s.name })))))
      .catch(() => setStages([]));
    apiFetch<Member[]>(`/workspaces/${workspaceId}/members`)
      .then((rows) => setMembers(rows.map((m) => ({ id: m.user.id, name: m.user.name, email: m.user.email }))))
      .catch(() => setMembers([]));
  }, [workspaceId]);

  async function saveDraft() {
    if (!workspaceId || !pendingGraph) return;
    await apiFetch(`/automations/${workspaceId}/${id}/draft`, { method: "PATCH", body: JSON.stringify({ graph: pendingGraph }) });
    setMessage("Draft saved.");
    load();
  }

  async function saveTrigger() {
    if (!workspaceId) return;
    await apiFetch(`/automations/${workspaceId}/${id}/trigger`, {
      method: "POST",
      body: JSON.stringify({
        type: channel === "instagram" ? "instagram_dm_keyword" : "whatsapp_message_keyword",
        config: { keywords: keywords.split(",").map((k) => k.trim()).filter(Boolean), matchType }
      })
    });
    setMessage("Trigger saved.");
    load();
  }

  async function publish() {
    if (!workspaceId) return;
    setMessage(null);
    if (pendingGraph) await apiFetch(`/automations/${workspaceId}/${id}/draft`, { method: "PATCH", body: JSON.stringify({ graph: pendingGraph }) });
    try {
      await apiFetch(`/automations/${workspaceId}/${id}/publish`, { method: "POST" });
      setMessage("Published.");
      load();
    } catch (err) {
      const apiErr = err as ApiError;
      const body = apiErr.body as { issues?: Array<{ message: string }> } | undefined;
      setMessage(body?.issues ? `Fix before publishing: ${body.issues.map((i) => i.message).join("; ")}` : apiErr.message);
    }
  }

  async function toggleStatus() {
    if (!workspaceId || !automation) return;
    const action = automation.status === "live" ? "pause" : "resume";
    await apiFetch(`/automations/${workspaceId}/${id}/${action}`, { method: "POST" });
    load();
  }

  async function remove() {
    if (!workspaceId || !confirm("Delete this automation?")) return;
    await apiFetch(`/automations/${workspaceId}/${id}`, { method: "DELETE" });
    router.push("/automations");
  }

  async function saveAsTemplate() {
    if (!workspaceId) return;
    const name = prompt("Template name:", `${automation?.name} template`);
    if (!name) return;
    await apiFetch(`/automations/${workspaceId}/${id}/save-as-template`, { method: "POST", body: JSON.stringify({ name }) });
    setMessage("Saved as template — find it under Browse templates.");
  }

  if (!workspaceId || !automation) return <p className="text-sm text-gray-500">Loading…</p>;

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">{automation.name}</h1>
        <div className="flex gap-2">
          <button type="button" onClick={toggleStatus} disabled={!automation.triggerId} className="rounded-md border border-gray-300 px-3 py-1.5 text-sm disabled:opacity-40">
            {automation.status === "live" ? "Pause" : "Resume"}
          </button>
          <button type="button" onClick={publish} className="rounded-md bg-brand px-3 py-1.5 text-sm font-semibold text-white">
            Publish
          </button>
          <button type="button" onClick={saveAsTemplate} className="rounded-md border border-gray-300 px-3 py-1.5 text-sm">
            Save as template
          </button>
          <button type="button" onClick={remove} className="rounded-md border border-red-200 px-3 py-1.5 text-sm text-red-600">
            Delete
          </button>
        </div>
      </div>
      {message && <p className="mt-2 text-sm text-gray-600">{message}</p>}

      <div className="mt-4 flex gap-1 border-b border-gray-200">
        {(["build", "test", "versions", "stats"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-3 py-2 text-sm font-medium capitalize ${tab === t ? "border-b-2 border-brand text-brand-700" : "text-gray-500"}`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "build" && (
        <div className="mt-4 space-y-6">
          <div className="rounded-md border border-gray-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-gray-900">Trigger</h2>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              <select value={channel} onChange={(e) => setChannel(e.target.value as "instagram" | "whatsapp")} className="rounded-md border border-gray-300 px-2 py-1.5">
                <option value="whatsapp">WhatsApp message</option>
                <option value="instagram">Instagram DM</option>
              </select>
              contains
              <input
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                placeholder="keyword1, keyword2"
                className="flex-1 rounded-md border border-gray-300 px-2 py-1.5"
              />
              <select value={matchType} onChange={(e) => setMatchType(e.target.value as "contains" | "exact" | "any")} className="rounded-md border border-gray-300 px-2 py-1.5">
                <option value="contains">contains</option>
                <option value="exact">exact match</option>
                <option value="any">any message</option>
              </select>
              <button type="button" onClick={saveTrigger} className="rounded-md bg-gray-800 px-3 py-1.5 text-sm font-semibold text-white">
                Save trigger
              </button>
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">Flow</h2>
              <button type="button" onClick={saveDraft} className="rounded-md border border-gray-300 px-3 py-1.5 text-sm">
                Save draft
              </button>
            </div>
            <FlowBlockEditor initialGraph={automation.draft?.graph} stages={stages} members={members} onChange={setPendingGraph} />
          </div>
        </div>
      )}

      {tab === "test" && <TestPanel workspaceId={workspaceId} automationId={id} />}
      {tab === "versions" && <VersionsPanel workspaceId={workspaceId} automationId={id} onRestored={load} />}
      {tab === "stats" && <StatsPanel workspaceId={workspaceId} automationId={id} />}
    </div>
  );
}

function TestPanel({ workspaceId, automationId }: { workspaceId: string; automationId: string }) {
  const [channel, setChannel] = useState<"instagram" | "whatsapp">("whatsapp");
  const [sampleMessage, setSampleMessage] = useState("");
  const [result, setResult] = useState<TestRunResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setError(null);
    try {
      const res = await apiFetch<TestRunResult>(`/automations/${workspaceId}/${automationId}/test`, {
        method: "POST",
        body: JSON.stringify({ channel, sampleMessage })
      });
      setResult(res);
    } catch (err) {
      setError((err as ApiError).message);
    }
  }

  return (
    <div className="mt-4 space-y-3">
      <p className="text-sm text-gray-500">
        Test runs don&apos;t create a lead and don&apos;t send real messages — each step logs what it would have done.
      </p>
      <div className="flex gap-2">
        <select value={channel} onChange={(e) => setChannel(e.target.value as "instagram" | "whatsapp")} className="rounded-md border border-gray-300 px-2 py-1.5 text-sm">
          <option value="whatsapp">WhatsApp</option>
          <option value="instagram">Instagram</option>
        </select>
        <input
          value={sampleMessage}
          onChange={(e) => setSampleMessage(e.target.value)}
          placeholder="Sample inbound message"
          className="flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm"
        />
        <button type="button" onClick={run} className="rounded-md bg-brand px-3 py-1.5 text-sm font-semibold text-white">
          Run test
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {result && (
        <ol className="space-y-2">
          {result.steps.map((s, i) => (
            <li key={i} className="rounded-md bg-gray-50 p-2 text-sm">
              <span className="font-medium">{s.type}</span> — <code className="text-xs">{JSON.stringify(s.output)}</code>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function VersionsPanel({ workspaceId, automationId, onRestored }: { workspaceId: string; automationId: string; onRestored: () => void }) {
  const [versions, setVersions] = useState<AutomationVersion[]>([]);

  function load() {
    apiFetch<AutomationVersion[]>(`/automations/${workspaceId}/${automationId}/versions`).then(setVersions).catch(() => setVersions([]));
  }
  useEffect(load, [workspaceId, automationId]);

  async function restore(version: number) {
    await apiFetch(`/automations/${workspaceId}/${automationId}/versions/${version}/restore`, { method: "POST" });
    load();
    onRestored();
  }

  return (
    <ul className="mt-4 divide-y divide-gray-100 rounded-md border border-gray-200 bg-white">
      {versions.map((v) => (
        <li key={v.id} className="flex items-center justify-between px-4 py-2 text-sm">
          <span>
            v{v.version} {v.publishedAt ? `· published ${new Date(v.publishedAt).toLocaleString()}` : "· draft"}
          </span>
          <button type="button" onClick={() => restore(v.version)} className="text-brand-700">
            Restore
          </button>
        </li>
      ))}
      {versions.length === 0 && <li className="px-4 py-4 text-sm text-gray-400">No versions yet.</li>}
    </ul>
  );
}

function StatsPanel({ workspaceId, automationId }: { workspaceId: string; automationId: string }) {
  const [stats, setStats] = useState<AutomationStats | null>(null);

  useEffect(() => {
    apiFetch<AutomationStats>(`/automations/${workspaceId}/${automationId}/stats`).then(setStats).catch(() => setStats(null));
  }, [workspaceId, automationId]);

  if (!stats) return <p className="mt-4 text-sm text-gray-400">Loading…</p>;

  return (
    <div className="mt-4 space-y-6">
      <div className="flex gap-4">
        {Object.entries(stats.runsByStatus).map(([status, count]) => (
          <div key={status} className="rounded-md border border-gray-200 bg-white px-4 py-2 text-center">
            <p className="text-lg font-semibold text-gray-900">{count}</p>
            <p className="text-xs capitalize text-gray-500">{status}</p>
          </div>
        ))}
        {Object.keys(stats.runsByStatus).length === 0 && <p className="text-sm text-gray-400">No runs yet.</p>}
      </div>

      <div>
        <h2 className="text-sm font-semibold text-gray-900">Step funnel</h2>
        <table className="mt-2 w-full text-left text-sm">
          <thead>
            <tr className="text-xs uppercase text-gray-500">
              <th className="py-1">Block</th>
              <th className="py-1">Type</th>
              <th className="py-1">Status</th>
              <th className="py-1">Count</th>
            </tr>
          </thead>
          <tbody>
            {stats.stepFunnel.map((s, i) => (
              <tr key={i} className="border-t border-gray-100">
                <td className="py-1">{s.blockId}</td>
                <td className="py-1">{s.type}</td>
                <td className="py-1">{s.status}</td>
                <td className="py-1">{s.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-gray-900">Recent runs</h2>
        <ul className="mt-2 space-y-1 text-sm">
          {stats.recentRuns.map((r) => (
            <li key={r.id} className="flex justify-between rounded-md bg-gray-50 px-3 py-1.5">
              <span>{r.lead?.name || r.lead?.phone || "Test run"}</span>
              <span className="text-gray-500">
                {r.status} · {new Date(r.startedAt).toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
