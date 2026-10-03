"use client";

import { useEffect, useState } from "react";
import { apiFetch, type ApiError } from "@/lib/api";
import type { AdminIntegrationField, AdminIntegrationGroup, IntegrationStatus } from "@/lib/admin-types";

const STATUS: Record<IntegrationStatus, { label: string; cls: string }> = {
  configured: { label: "Configured", cls: "bg-green-50 text-green-700" },
  partial: { label: "Partly set", cls: "bg-amber-50 text-amber-800" },
  missing: { label: "Not set", cls: "bg-gray-100 text-gray-600" },
  coming_soon: { label: "Coming soon", cls: "bg-amber-50 text-amber-800" }
};

const SOURCE_LABEL = { dashboard: "Set here", env: "From server settings (.env)", none: "Not set" } as const;

function FieldRow({ field, onChange }: { field: AdminIntegrationField; onChange: (groups: AdminIntegrationGroup[]) => void }) {
  const [value, setValue] = useState(field.secret ? "" : (field.value ?? ""));
  const [message, setMessage] = useState<string | null>(null);

  async function run(action: () => Promise<AdminIntegrationGroup[]>, done: string) {
    setMessage(null);
    try {
      onChange(await action());
      if (field.secret) setValue("");
      setMessage(done);
    } catch (err) {
      setMessage((err as ApiError).message ?? "Could not save");
    }
  }

  const save = () => run(() => apiFetch(`/admin/integrations/${field.key}`, { method: "PUT", body: JSON.stringify({ value }) }), "Saved.");
  const clear = () => run(() => apiFetch(`/admin/integrations/${field.key}`, { method: "DELETE" }), "Cleared.");

  return (
    <div className="py-3">
      <div className="flex items-center justify-between text-sm">
        <label htmlFor={field.key} className="font-medium text-gray-800">
          {field.label}
        </label>
        <span className={`text-xs ${field.configured ? "text-green-700" : "text-gray-400"}`}>
          {field.configured ? `✓ ${SOURCE_LABEL[field.source]}` : "Not set"}
        </span>
      </div>
      {field.help && <p className="text-xs text-gray-400">{field.help}</p>}
      <div className="mt-1.5 flex gap-2">
        <input
          id={field.key}
          type={field.secret ? "password" : "text"}
          autoComplete="off"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={field.secret ? (field.configured ? "•••••••• (enter a new value to replace)" : "Paste value") : "Value"}
          className="flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm"
        />
        <button type="button" onClick={save} disabled={!value.trim()} className="rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
          Save
        </button>
        {field.source === "dashboard" && (
          <button type="button" onClick={clear} className="rounded-md border border-gray-300 px-3 py-1.5 text-xs text-gray-700">
            Clear
          </button>
        )}
      </div>
      {message && <p className="mt-1 text-xs text-gray-500">{message}</p>}
    </div>
  );
}

export default function AdminIntegrationsPage() {
  const [groups, setGroups] = useState<AdminIntegrationGroup[]>([]);

  useEffect(() => {
    apiFetch<AdminIntegrationGroup[]>("/admin/integrations").then(setGroups).catch(() => setGroups([]));
  }, []);

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold text-gray-900">Integrations</h1>
      <p className="mt-1 text-sm text-gray-500">
        Credentials for the third-party services Zenora uses. Secrets are stored encrypted and can never be viewed again — only replaced or cleared.
        Values set here override the server&apos;s .env.
      </p>

      <div className="mt-6 space-y-4">
        {groups.map((g) => (
          <section key={g.id} className="rounded-md border border-gray-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">{g.title}</h2>
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS[g.status].cls}`}>{STATUS[g.status].label}</span>
            </div>
            <p className="mt-1 text-xs text-gray-500">{g.description}</p>

            {g.setupLinks.length > 0 && (
              <div className="mt-3 rounded-md bg-gray-50 p-3 text-xs text-gray-600">
                <p className="font-medium text-gray-700">Paste these into the provider&apos;s console:</p>
                {g.setupLinks.map((l) => (
                  <p key={l.url} className="mt-1">
                    {l.label}: <code className="select-all break-all text-gray-900">{l.url}</code>
                  </p>
                ))}
              </div>
            )}
            {g.restartRequired && (
              <p className="mt-2 text-xs text-amber-700">Sign-in with Google reads these when the API starts, so restart the API after changing them.</p>
            )}

            {g.fields.length > 0 && (
              <div className="mt-2 divide-y divide-gray-100">
                {g.fields.map((f) => (
                  <FieldRow key={f.key} field={f} onChange={setGroups} />
                ))}
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
