"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { Broadcast } from "@/lib/broadcast-types";
import { useCurrentWorkspace } from "@/lib/use-workspace";

const STATUS_STYLES: Record<Broadcast["status"], string> = {
  draft: "bg-gray-100 text-gray-600",
  scheduled: "bg-amber-100 text-amber-700",
  sending: "bg-blue-100 text-blue-700",
  sent: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700"
};

export default function BroadcastsPage() {
  const { workspaceId } = useCurrentWorkspace();
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);

  function load() {
    if (!workspaceId) return;
    apiFetch<Broadcast[]>(`/broadcasts/${workspaceId}`).then(setBroadcasts).catch(() => setBroadcasts([]));
  }
  useEffect(load, [workspaceId]);

  if (!workspaceId) return <p className="text-sm text-gray-500">Log in and create a workspace first.</p>;

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Broadcasts</h1>
          <Link href="/broadcasts/templates" className="text-sm text-brand-700">
            Manage WhatsApp templates →
          </Link>
        </div>
        <Link href="/broadcasts/new" className="rounded-md bg-brand px-3 py-2 text-sm font-semibold text-white">
          New broadcast
        </Link>
      </div>

      <ul className="mt-4 divide-y divide-gray-100 rounded-md border border-gray-200 bg-white">
        {broadcasts.map((b) => (
          <li key={b.id} className="flex items-center justify-between px-4 py-3">
            <div>
              <Link href={`/broadcasts/${b.id}`} className="font-medium text-brand-700">
                {b.template.name}
              </Link>
              <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-400">
                <span>{b._count?.recipients ?? 0} recipients</span>
                {b.costEstimate != null && <span>₹{(b.costEstimate / 100).toFixed(2)} est.</span>}
                <span>{new Date(b.createdAt).toLocaleDateString()}</span>
              </div>
            </div>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_STYLES[b.status]}`}>{b.status}</span>
          </li>
        ))}
        {broadcasts.length === 0 && <li className="px-4 py-6 text-center text-sm text-gray-400">No broadcasts yet.</li>}
      </ul>
    </div>
  );
}
