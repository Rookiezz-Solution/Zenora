"use client";

import Papa from "papaparse";
import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { useCurrentWorkspace } from "@/lib/use-workspace";

type FieldKey = "name" | "phone" | "email" | "tags";
const FIELDS: { key: FieldKey; label: string }[] = [
  { key: "name", label: "Name" },
  { key: "phone", label: "Phone" },
  { key: "email", label: "Email" },
  { key: "tags", label: "Tags (comma-separated)" }
];

export default function ImportLeadsPage() {
  const { workspaceId } = useCurrentWorkspace();
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Partial<Record<FieldKey, string>>>({});
  const [dedupeStrategy, setDedupeStrategy] = useState<"skip" | "update">("skip");
  const [result, setResult] = useState<{ created: number; updated: number; skipped: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        setHeaders(res.meta.fields ?? []);
        setRows(res.data);
        // Best-effort auto-map by matching header names.
        const auto: Partial<Record<FieldKey, string>> = {};
        for (const field of FIELDS) {
          const match = (res.meta.fields ?? []).find((h) => h.toLowerCase().includes(field.key));
          if (match) auto[field.key] = match;
        }
        setMapping(auto);
        setResult(null);
      }
    });
  }

  function mappedRow(row: Record<string, string>) {
    return {
      name: mapping.name ? row[mapping.name] : undefined,
      phone: mapping.phone ? row[mapping.phone] : undefined,
      email: mapping.email ? row[mapping.email] : undefined,
      tags: mapping.tags ? row[mapping.tags]?.split(",").map((t) => t.trim()).filter(Boolean) : undefined
    };
  }

  async function handleImport() {
    if (!workspaceId || rows.length === 0) return;
    setError(null);
    try {
      const res = await apiFetch<{ created: number; updated: number; skipped: number }>(`/leads/${workspaceId}/import`, {
        method: "POST",
        body: JSON.stringify({ dedupeStrategy, rows: rows.map(mappedRow) })
      });
      setResult(res);
    } catch (err) {
      setError((err as { message?: string }).message ?? "Import failed");
    }
  }

  if (!workspaceId) {
    return <p className="text-sm text-gray-500">Log in and create a workspace first.</p>;
  }

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold text-gray-900">Import leads</h1>
      <p className="mt-1 text-sm text-gray-500">Upload a CSV, map its columns to lead fields, then import.</p>

      <input type="file" accept=".csv" onChange={onFile} className="mt-4 text-sm" />

      {headers.length > 0 && (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {FIELDS.map((field) => (
              <label key={field.key} className="flex flex-col gap-1 text-sm">
                {field.label}
                <select
                  value={mapping[field.key] ?? ""}
                  onChange={(e) => setMapping({ ...mapping, [field.key]: e.target.value || undefined })}
                  className="rounded-md border border-gray-300 px-2 py-1.5"
                >
                  <option value="">Don&apos;t import</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>

          <label className="mt-4 flex items-center gap-2 text-sm">
            If a lead with the same phone/email already exists:
            <select
              value={dedupeStrategy}
              onChange={(e) => setDedupeStrategy(e.target.value as "skip" | "update")}
              className="rounded-md border border-gray-300 px-2 py-1"
            >
              <option value="skip">Skip it</option>
              <option value="update">Update it</option>
            </select>
          </label>

          <h2 className="mt-6 text-sm font-semibold text-gray-900">Preview ({rows.length} rows)</h2>
          <table className="mt-2 w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-xs uppercase text-gray-500">
                {FIELDS.map((f) => (
                  <th key={f.key} className="py-1 pr-4">
                    {f.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 5).map((row, i) => {
                const m = mappedRow(row);
                return (
                  <tr key={i} className="border-b border-gray-100">
                    <td className="py-1 pr-4">{m.name || "—"}</td>
                    <td className="py-1 pr-4">{m.phone || "—"}</td>
                    <td className="py-1 pr-4">{m.email || "—"}</td>
                    <td className="py-1 pr-4">{m.tags?.join(", ") || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <button type="button" onClick={handleImport} className="mt-4 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white">
            Import {rows.length} leads
          </button>

          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          {result && (
            <p className="mt-2 text-sm text-gray-700">
              Created {result.created}, updated {result.updated}, skipped {result.skipped}.
            </p>
          )}
        </>
      )}
    </div>
  );
}
