"use client";

import { useEffect, useState } from "react";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import { apiFetch } from "@/lib/api";
import type { CustomField } from "@/lib/pipeline-types";
import { useCurrentWorkspace } from "@/lib/use-workspace";

const FIELD_TYPES: CustomField["type"][] = ["text", "number", "date", "select", "multiselect", "boolean"];

export default function CustomFieldsPage() {
  const { workspaceId } = useCurrentWorkspace();
  const [fields, setFields] = useState<CustomField[]>([]);
  const [form, setForm] = useState({ key: "", label: "", type: "text" as CustomField["type"], options: "", required: false });
  const [error, setError] = useState<string | null>(null);

  function load() {
    if (!workspaceId) return;
    apiFetch<CustomField[]>(`/workspaces/${workspaceId}/custom-fields`).then(setFields).catch(() => setFields([]));
  }
  useEffect(load, [workspaceId]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!workspaceId) return;
    setError(null);
    try {
      await apiFetch(`/workspaces/${workspaceId}/custom-fields`, {
        method: "POST",
        body: JSON.stringify({
          key: form.key,
          label: form.label,
          type: form.type,
          required: form.required,
          options: form.options ? form.options.split(",").map((o) => o.trim()).filter(Boolean) : undefined
        })
      });
      setForm({ key: "", label: "", type: "text", options: "", required: false });
      load();
    } catch (err) {
      setError((err as { message?: string }).message ?? "Could not create field");
    }
  }

  async function remove(id: string) {
    if (!workspaceId) return;
    await apiFetch(`/workspaces/${workspaceId}/custom-fields/${id}`, { method: "DELETE" });
    load();
  }

  if (!workspaceId) return <p className="text-sm text-gray-500">Log in and create a workspace first.</p>;

  return (
    <div className="max-w-xl">
      <SettingsTabs />
      <h1 className="text-2xl font-semibold text-gray-900">Custom fields</h1>
      <p className="mt-1 text-sm text-gray-500">Fields leads can carry — required ones gate moving into a stage.</p>

      <ul className="mt-4 divide-y divide-gray-100 rounded-md border border-gray-200 bg-white">
        {fields.map((f) => (
          <li key={f.id} className="flex items-center justify-between px-4 py-2 text-sm">
            <span>
              <span className="font-medium text-gray-900">{f.label}</span>{" "}
              <span className="text-gray-400">
                ({f.key} · {f.type}
                {f.required ? " · required" : ""})
              </span>
            </span>
            <button type="button" onClick={() => remove(f.id)} className="text-red-600">
              Remove
            </button>
          </li>
        ))}
        {fields.length === 0 && <li className="px-4 py-3 text-sm text-gray-400">No custom fields yet.</li>}
      </ul>

      <form onSubmit={create} className="mt-4 flex flex-wrap items-end gap-2 rounded-md border border-gray-200 bg-white p-4">
        <input
          placeholder="key (e.g. budget_range)"
          value={form.key}
          onChange={(e) => setForm({ ...form, key: e.target.value })}
          className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
        />
        <input
          placeholder="Label"
          value={form.label}
          onChange={(e) => setForm({ ...form, label: e.target.value })}
          className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
        />
        <select
          value={form.type}
          onChange={(e) => setForm({ ...form, type: e.target.value as CustomField["type"] })}
          className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
        >
          {FIELD_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        {(form.type === "select" || form.type === "multiselect") && (
          <input
            placeholder="Options, comma-separated"
            value={form.options}
            onChange={(e) => setForm({ ...form, options: e.target.value })}
            className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
          />
        )}
        <label className="flex items-center gap-1 text-sm text-gray-600">
          <input type="checkbox" checked={form.required} onChange={(e) => setForm({ ...form, required: e.target.checked })} />
          Required
        </label>
        <button type="submit" className="rounded-md bg-brand px-3 py-1.5 text-sm font-semibold text-white">
          Add field
        </button>
        {error && <p className="w-full text-sm text-red-600">{error}</p>}
      </form>
    </div>
  );
}
