"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { Broadcast } from "@/lib/broadcast-types";
import type { Lead } from "@/lib/lead-types";
import { useCurrentWorkspace } from "@/lib/use-workspace";

const STATUS_STYLES: Record<Broadcast["status"], string> = {
  draft: "bg-gray-100 text-gray-600",
  scheduled: "bg-amber-100 text-amber-700",
  sending: "bg-blue-100 text-blue-700",
  sent: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700"
};

const RECIPIENT_STATUS_STYLES: Record<string, string> = {
  pending: "bg-gray-100 text-gray-600",
  sent: "bg-green-100 text-green-700",
  delivered: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
  skipped: "bg-amber-100 text-amber-700"
};

export default function BroadcastDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { workspaceId } = useCurrentWorkspace();
  const [broadcast, setBroadcast] = useState<Broadcast | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [testLeadId, setTestLeadId] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function load() {
    if (!workspaceId) return;
    apiFetch<Broadcast>(`/broadcasts/${workspaceId}/${id}`).then(setBroadcast).catch(() => setBroadcast(null));
  }
  useEffect(load, [workspaceId, id]);

  useEffect(() => {
    if (!workspaceId) return;
    apiFetch<Lead[]>(`/leads/${workspaceId}`).then(setLeads).catch(() => setLeads([]));
  }, [workspaceId]);

  async function sendTest() {
    if (!workspaceId || !testLeadId) return;
    setBusy(true);
    setMessage(null);
    try {
      await apiFetch(`/broadcasts/${workspaceId}/${id}/test`, { method: "POST", body: JSON.stringify({ leadId: testLeadId }) });
      setMessage("Test sent.");
    } catch (err) {
      setMessage((err as { message?: string }).message ?? "Could not send test");
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    if (!workspaceId) return;
    if (!confirm(broadcast?.scheduledAt ? "Schedule this broadcast?" : "Send this broadcast now?")) return;
    setBusy(true);
    setMessage(null);
    try {
      await apiFetch(`/broadcasts/${workspaceId}/${id}/send`, { method: "POST" });
      setMessage("Broadcast queued.");
      load();
    } catch (err) {
      setMessage((err as { message?: string }).message ?? "Could not send broadcast");
    } finally {
      setBusy(false);
    }
  }

  if (!workspaceId || !broadcast) return <p className="text-sm text-gray-500">Loading…</p>;

  return (
    <div className="max-w-xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">{broadcast.template.name}</h1>
          <Link href="/broadcasts" className="text-sm text-brand-700">
            ← Back to broadcasts
          </Link>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_STYLES[broadcast.status]}`}>{broadcast.status}</span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 rounded-md border border-gray-200 bg-white p-4 text-sm">
        <div>
          <span className="text-gray-500">Category</span>
          <p className="capitalize">{broadcast.template.category}</p>
        </div>
        <div>
          <span className="text-gray-500">Estimated cost</span>
          <p>{broadcast.costEstimate != null ? `₹${(broadcast.costEstimate / 100).toFixed(2)}` : "—"}</p>
        </div>
        <div>
          <span className="text-gray-500">Recipients</span>
          <p>{broadcast.recipients?.length ?? broadcast._count?.recipients ?? 0}</p>
        </div>
        <div>
          <span className="text-gray-500">{broadcast.scheduledAt ? "Scheduled for" : "Sent at"}</span>
          <p>{broadcast.scheduledAt ? new Date(broadcast.scheduledAt).toLocaleString() : broadcast.sentAt ? new Date(broadcast.sentAt).toLocaleString() : "—"}</p>
        </div>
      </div>

      {message && <p className="mt-2 text-sm text-gray-600">{message}</p>}

      {broadcast.status === "draft" && (
        <div className="mt-4 space-y-3 rounded-md border border-gray-200 bg-white p-4">
          <div>
            <p className="text-sm font-medium text-gray-700">Send a test</p>
            <div className="mt-1 flex gap-2">
              <select value={testLeadId} onChange={(e) => setTestLeadId(e.target.value)} className="flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm">
                <option value="">Choose a lead…</option>
                {leads.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name || l.phone || l.id}
                  </option>
                ))}
              </select>
              <button type="button" onClick={sendTest} disabled={busy || !testLeadId} className="rounded-md border border-gray-300 px-3 py-1.5 text-sm disabled:opacity-50">
                Send test
              </button>
            </div>
          </div>

          <button type="button" onClick={send} disabled={busy} className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {broadcast.scheduledAt ? "Schedule broadcast" : "Send now"}
          </button>
        </div>
      )}

      {broadcast.recipients && broadcast.recipients.length > 0 && (
        <div className="mt-4">
          <p className="text-sm font-medium text-gray-700">Recipients</p>
          <ul className="mt-1 divide-y divide-gray-100 rounded-md border border-gray-200 bg-white">
            {broadcast.recipients.map((r) => (
              <li key={r.id} className="flex items-center justify-between px-3 py-2 text-sm">
                <span>{r.lead?.name || r.lead?.phone || r.leadId}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${RECIPIENT_STATUS_STYLES[r.status] ?? "bg-gray-100 text-gray-600"}`}>
                  {r.status}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
