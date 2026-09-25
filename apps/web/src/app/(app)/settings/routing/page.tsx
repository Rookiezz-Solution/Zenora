"use client";

import { useEffect, useState } from "react";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import { apiFetch } from "@/lib/api";
import type { CustomField } from "@/lib/pipeline-types";
import type { AssignTo, AssignToType, Member, RoutingCondition, RoutingRule, ScoringRule } from "@/lib/routing-types";
import { useCurrentWorkspace } from "@/lib/use-workspace";

const EMPTY_CONDITION: RoutingCondition = { field: "source", operator: "equals", value: "" };

function ConditionEditor({
  condition,
  fields,
  onChange
}: {
  condition: RoutingCondition;
  fields: CustomField[];
  onChange: (c: RoutingCondition) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={condition.field}
        onChange={(e) => onChange({ ...condition, field: e.target.value as RoutingCondition["field"], fieldId: undefined })}
        className="rounded-md border border-gray-300 px-2 py-1 text-xs"
      >
        <option value="source">Source</option>
        <option value="tag">Tag (interest)</option>
        <option value="customField">Custom field (language, budget, …)</option>
      </select>
      {condition.field === "customField" && (
        <select
          value={condition.fieldId ?? ""}
          onChange={(e) => onChange({ ...condition, fieldId: e.target.value })}
          className="rounded-md border border-gray-300 px-2 py-1 text-xs"
        >
          <option value="">Pick a field…</option>
          {fields.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>
      )}
      <select
        value={condition.operator}
        onChange={(e) => onChange({ ...condition, operator: e.target.value as RoutingCondition["operator"] })}
        className="rounded-md border border-gray-300 px-2 py-1 text-xs"
      >
        <option value="equals">equals</option>
        <option value="contains">contains</option>
      </select>
      <input
        value={condition.value}
        onChange={(e) => onChange({ ...condition, value: e.target.value })}
        placeholder="value"
        className="w-32 rounded-md border border-gray-300 px-2 py-1 text-xs"
      />
    </div>
  );
}

export default function RoutingSettingsPage() {
  const { workspaceId } = useCurrentWorkspace();
  const [routingRules, setRoutingRules] = useState<RoutingRule[]>([]);
  const [scoringRules, setScoringRules] = useState<ScoringRule[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [fields, setFields] = useState<CustomField[]>([]);
  const [slaMinutes, setSlaMinutes] = useState(30);
  const [savedSla, setSavedSla] = useState(false);

  const [newCondition, setNewCondition] = useState<RoutingCondition>(EMPTY_CONDITION);
  const [newAssignType, setNewAssignType] = useState<AssignToType>("least_busy");
  const [newAssignUserId, setNewAssignUserId] = useState("");

  const [newScoreCondition, setNewScoreCondition] = useState<RoutingCondition>(EMPTY_CONDITION);
  const [newScorePoints, setNewScorePoints] = useState(10);

  function load() {
    if (!workspaceId) return;
    apiFetch<RoutingRule[]>(`/routing/${workspaceId}/rules`).then(setRoutingRules).catch(() => setRoutingRules([]));
    apiFetch<ScoringRule[]>(`/routing/${workspaceId}/scoring`).then(setScoringRules).catch(() => setScoringRules([]));
    apiFetch<Member[]>(`/workspaces/${workspaceId}/members`).then(setMembers).catch(() => setMembers([]));
    apiFetch<CustomField[]>(`/workspaces/${workspaceId}/custom-fields`).then(setFields).catch(() => setFields([]));
    apiFetch<{ slaMinutes: number }>(`/workspaces/${workspaceId}`).then((ws) => setSlaMinutes(ws.slaMinutes)).catch(() => {});
  }
  useEffect(load, [workspaceId]);

  async function saveSla(e: React.FormEvent) {
    e.preventDefault();
    if (!workspaceId) return;
    await apiFetch(`/workspaces/${workspaceId}`, { method: "PATCH", body: JSON.stringify({ slaMinutes }) });
    setSavedSla(true);
    setTimeout(() => setSavedSla(false), 2000);
  }

  async function toggleAvailable(member: Member) {
    if (!workspaceId) return;
    await apiFetch(`/workspaces/${workspaceId}/members/${member.id}/availability`, {
      method: "PATCH",
      body: JSON.stringify({ available: !member.available })
    });
    load();
  }

  async function addRoutingRule() {
    if (!workspaceId || !newCondition.value) return;
    const assignTo: AssignTo = { type: newAssignType, ...(newAssignType === "user" && newAssignUserId ? { targetId: newAssignUserId } : {}) };
    await apiFetch(`/routing/${workspaceId}/rules`, {
      method: "POST",
      body: JSON.stringify({ conditions: [newCondition], assignTo })
    });
    setNewCondition(EMPTY_CONDITION);
    setNewAssignUserId("");
    load();
  }

  async function removeRoutingRule(id: string) {
    if (!workspaceId) return;
    await apiFetch(`/routing/${workspaceId}/rules/${id}`, { method: "DELETE" });
    load();
  }

  async function moveRule(index: number, direction: -1 | 1) {
    if (!workspaceId) return;
    const ids = routingRules.map((r) => r.id);
    const target = index + direction;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    await apiFetch(`/routing/${workspaceId}/rules/reorder`, { method: "PATCH", body: JSON.stringify({ ruleIds: ids }) });
    load();
  }

  async function addScoringRule() {
    if (!workspaceId || !newScoreCondition.value) return;
    await apiFetch(`/routing/${workspaceId}/scoring`, {
      method: "POST",
      body: JSON.stringify({ condition: newScoreCondition, points: newScorePoints })
    });
    setNewScoreCondition(EMPTY_CONDITION);
    setNewScorePoints(10);
    load();
  }

  async function removeScoringRule(id: string) {
    if (!workspaceId) return;
    await apiFetch(`/routing/${workspaceId}/scoring/${id}`, { method: "DELETE" });
    load();
  }

  function describeCondition(c: RoutingCondition) {
    const field = c.field === "customField" ? fields.find((f) => f.id === c.fieldId)?.label ?? "custom field" : c.field;
    return `${field} ${c.operator} "${c.value}"`;
  }

  function describeAssignTo(a: AssignTo) {
    if (a.type === "user") return `→ ${members.find((m) => m.userId === a.targetId)?.user.name ?? "a specific person"}`;
    if (a.type === "least_busy") return "→ least-busy available rep";
    if (a.type === "round_robin") return "→ round-robin among available reps";
    return "→ team";
  }

  if (!workspaceId) return <p className="text-sm text-gray-500">Log in and create a workspace first.</p>;

  return (
    <div className="max-w-2xl">
      <SettingsTabs />
      <h1 className="text-2xl font-semibold text-gray-900">Routing, scoring and SLA</h1>
      <p className="mt-1 text-sm text-gray-500">Score and route new leads automatically, and set the speed rule for first response.</p>

      <section className="mt-6 rounded-md border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-900">Speed rule</h2>
        <form onSubmit={saveSla} className="mt-2 flex items-center gap-2 text-sm">
          <span className="text-gray-600">Respond within</span>
          <input
            type="number"
            min={1}
            value={slaMinutes}
            onChange={(e) => setSlaMinutes(Number(e.target.value))}
            className="w-20 rounded-md border border-gray-300 px-2 py-1"
          />
          <span className="text-gray-600">minutes, else reassign</span>
          <button type="submit" className="rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-white">
            Save
          </button>
          {savedSla && <span className="text-xs text-green-600">Saved.</span>}
        </form>
      </section>

      <section className="mt-6 rounded-md border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-900">Team availability</h2>
        <p className="mt-1 text-xs text-gray-400">Unavailable members are skipped by least-busy / round-robin routing.</p>
        <ul className="mt-2 divide-y divide-gray-100">
          {members.map((m) => (
            <li key={m.id} className="flex items-center justify-between py-1.5 text-sm">
              <span>
                {m.user.name ?? m.user.email} <span className="text-xs text-gray-400">({m.role})</span>
              </span>
              <label className="flex items-center gap-1 text-xs text-gray-600">
                <input type="checkbox" checked={m.available} onChange={() => toggleAvailable(m)} />
                Available
              </label>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-6 rounded-md border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-900">Scoring rules</h2>
        <p className="mt-1 text-xs text-gray-400">Points are summed across every matching rule on lead creation.</p>
        <ul className="mt-2 divide-y divide-gray-100">
          {scoringRules.map((r) => (
            <li key={r.id} className="flex items-center justify-between py-1.5 text-sm">
              <span>
                {describeCondition(r.condition)} → <span className="font-medium">{r.points > 0 ? `+${r.points}` : r.points} pts</span>
              </span>
              <button type="button" onClick={() => removeScoringRule(r.id)} className="text-xs text-red-600">
                Remove
              </button>
            </li>
          ))}
          {scoringRules.length === 0 && <li className="py-2 text-sm text-gray-400">No scoring rules yet.</li>}
        </ul>
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3">
          <ConditionEditor condition={newScoreCondition} fields={fields} onChange={setNewScoreCondition} />
          <input
            type="number"
            value={newScorePoints}
            onChange={(e) => setNewScorePoints(Number(e.target.value))}
            className="w-16 rounded-md border border-gray-300 px-2 py-1 text-xs"
          />
          <span className="text-xs text-gray-500">pts</span>
          <button type="button" onClick={addScoringRule} className="rounded-md bg-brand px-3 py-1 text-xs font-semibold text-white">
            Add
          </button>
        </div>
      </section>

      <section className="mt-6 rounded-md border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-900">Routing rules</h2>
        <p className="mt-1 text-xs text-gray-400">
          Ordered — the first matching rule wins. Leads that match nothing fall back to the least-busy available rep.
        </p>
        <ul className="mt-2 divide-y divide-gray-100">
          {routingRules.map((r, i) => (
            <li key={r.id} className="flex items-center justify-between py-1.5 text-sm">
              <span>
                {r.conditions.map(describeCondition).join(" and ")} <span className="text-gray-500">{describeAssignTo(r.assignTo)}</span>
              </span>
              <div className="flex items-center gap-2 text-xs">
                <button type="button" onClick={() => moveRule(i, -1)} disabled={i === 0} className="text-gray-400 disabled:opacity-30">
                  ↑
                </button>
                <button type="button" onClick={() => moveRule(i, 1)} disabled={i === routingRules.length - 1} className="text-gray-400 disabled:opacity-30">
                  ↓
                </button>
                <button type="button" onClick={() => removeRoutingRule(r.id)} className="text-red-600">
                  Remove
                </button>
              </div>
            </li>
          ))}
          {routingRules.length === 0 && <li className="py-2 text-sm text-gray-400">No routing rules yet — everything falls back to least-busy.</li>}
        </ul>
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3">
          <ConditionEditor condition={newCondition} fields={fields} onChange={setNewCondition} />
          <select value={newAssignType} onChange={(e) => setNewAssignType(e.target.value as AssignToType)} className="rounded-md border border-gray-300 px-2 py-1 text-xs">
            <option value="least_busy">Least busy</option>
            <option value="round_robin">Round robin</option>
            <option value="user">Specific person</option>
          </select>
          {newAssignType === "user" && (
            <select value={newAssignUserId} onChange={(e) => setNewAssignUserId(e.target.value)} className="rounded-md border border-gray-300 px-2 py-1 text-xs">
              <option value="">Pick a person…</option>
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.user.name ?? m.user.email}
                </option>
              ))}
            </select>
          )}
          <button type="button" onClick={addRoutingRule} className="rounded-md bg-brand px-3 py-1 text-xs font-semibold text-white">
            Add
          </button>
        </div>
      </section>
    </div>
  );
}
