"use client";

import { useEffect, useState } from "react";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import { apiFetch } from "@/lib/api";
import { useCurrentWorkspace } from "@/lib/use-workspace";

const DEFAULT_LABELS = {
  lead: "Lead",
  appointment: "Appointment",
  salesperson: "Salesperson",
  won: "Won",
  pipeline: "Pipeline",
  interest: "Interest"
};

interface Workspace {
  currency: string;
  timezone: string;
  labels: Partial<typeof DEFAULT_LABELS>;
}

export default function LabelsSettingsPage() {
  const { workspaceId } = useCurrentWorkspace();
  const [labels, setLabels] = useState(DEFAULT_LABELS);
  const [currency, setCurrency] = useState("INR");
  const [timezone, setTimezone] = useState("Asia/Kolkata");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!workspaceId) return;
    apiFetch<Workspace>(`/workspaces/${workspaceId}`).then((ws) => {
      setLabels({ ...DEFAULT_LABELS, ...ws.labels });
      setCurrency(ws.currency);
      setTimezone(ws.timezone);
    });
  }, [workspaceId]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!workspaceId) return;
    await apiFetch(`/workspaces/${workspaceId}`, {
      method: "PATCH",
      body: JSON.stringify({ currency, timezone, labels })
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  if (!workspaceId) return <p className="text-sm text-gray-500">Log in and create a workspace first.</p>;

  return (
    <div className="max-w-xl">
      <SettingsTabs />
      <h1 className="text-2xl font-semibold text-gray-900">Industry and labels</h1>
      <p className="mt-1 text-sm text-gray-500">Rename these terms to match your business — they show up everywhere in the app.</p>

      <form onSubmit={save} className="mt-4 space-y-3 rounded-md border border-gray-200 bg-white p-4">
        {(Object.keys(DEFAULT_LABELS) as (keyof typeof DEFAULT_LABELS)[]).map((key) => (
          <label key={key} className="flex items-center justify-between gap-3 text-sm">
            <span className="text-gray-500">{DEFAULT_LABELS[key]}</span>
            <input
              value={labels[key] ?? ""}
              onChange={(e) => setLabels({ ...labels, [key]: e.target.value })}
              className="w-48 rounded-md border border-gray-300 px-2 py-1.5"
            />
          </label>
        ))}

        <div className="border-t border-gray-100 pt-3">
          <label className="flex items-center justify-between gap-3 text-sm">
            <span className="text-gray-500">Currency</span>
            <input
              value={currency}
              onChange={(e) => setCurrency(e.target.value.toUpperCase())}
              maxLength={3}
              className="w-48 rounded-md border border-gray-300 px-2 py-1.5"
            />
          </label>
          <label className="mt-3 flex items-center justify-between gap-3 text-sm">
            <span className="text-gray-500">Time zone</span>
            <input
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="w-48 rounded-md border border-gray-300 px-2 py-1.5"
            />
          </label>
        </div>

        <button type="submit" className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white">
          Save
        </button>
        {saved && <span className="ml-3 text-sm text-green-600">Saved.</span>}
      </form>
    </div>
  );
}
