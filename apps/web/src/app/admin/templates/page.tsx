"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, type ApiError } from "@/lib/api";

interface PendingTemplate {
  id: string;
  name: string;
  industry: string | null;
  createdAt: string;
  text: string[];
}

export default function AdminTemplatesPage() {
  const [rows, setRows] = useState<PendingTemplate[] | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const load = useCallback(() => {
    apiFetch<PendingTemplate[]>("/admin/templates/pending").then(setRows).catch(() => setRows([]));
  }, []);
  useEffect(load, [load]);

  async function act(path: string, body: unknown, success: string) {
    setMessage(null);
    try {
      await apiFetch(`/admin/templates/${path}`, { method: "POST", body: JSON.stringify(body ?? {}) });
      setMessage({ tone: "ok", text: success });
      setRejecting(null);
      setReason("");
      load();
    } catch (err) {
      setMessage({ tone: "error", text: (err as ApiError).message ?? "Something went wrong" });
    }
  }

  if (!rows) return <p className="text-sm text-gray-400">Loading…</p>;

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold text-gray-900">Template review</h1>
      <p className="mt-1 text-sm text-gray-500">
        Templates people have asked to publish to the public gallery. Read what each one says before approving: once approved, every workspace can copy it. Phone numbers and emails were already blocked.
      </p>

      {message && <p className={`mt-4 rounded-md px-3 py-2 text-sm ${message.tone === "ok" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>{message.text}</p>}

      {rows.length === 0 && <p className="mt-6 text-sm text-gray-400">Nothing is waiting for review.</p>}
      <ul className="mt-4 space-y-3">
        {rows.map((t) => (
          <li key={t.id} className="rounded-md border border-gray-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <p className="font-medium text-gray-900">
                {t.name} {t.industry && <span className="ml-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">{t.industry}</span>}
              </p>
              <span className="text-xs text-gray-400">{new Date(t.createdAt).toLocaleDateString()}</span>
            </div>
            <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto rounded bg-gray-50 p-2 text-xs text-gray-700">
              {t.text.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
            {rejecting === t.id ? (
              <div className="mt-3 flex gap-2">
                <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason shown to the author" className="flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm" />
                <button type="button" disabled={reason.trim().length < 3} onClick={() => act(`${t.id}/reject`, { reason }, "Rejected.")} className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
                  Reject
                </button>
                <button type="button" onClick={() => setRejecting(null)} className="text-xs text-gray-500 underline">
                  Cancel
                </button>
              </div>
            ) : (
              <div className="mt-3 flex gap-3">
                <button type="button" onClick={() => act(`${t.id}/approve`, {}, "Approved and published.")} className="rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-white">
                  Approve
                </button>
                <button type="button" onClick={() => setRejecting(t.id)} className="text-xs text-red-600 underline">
                  Reject…
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
