"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { WaTemplate } from "@/lib/broadcast-types";
import { useCurrentWorkspace } from "@/lib/use-workspace";

const STATUS_STYLES: Record<WaTemplate["metaStatus"], string> = {
  pending: "bg-amber-100 text-amber-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700"
};

export default function WaTemplatesPage() {
  const { workspaceId } = useCurrentWorkspace();
  const [templates, setTemplates] = useState<WaTemplate[]>([]);

  function load() {
    if (!workspaceId) return;
    apiFetch<WaTemplate[]>(`/workspaces/${workspaceId}/templates?scope=all`).then(setTemplates).catch(() => setTemplates([]));
  }
  useEffect(load, [workspaceId]);

  if (!workspaceId) return <p className="text-sm text-gray-500">Log in and create a workspace first.</p>;

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">WhatsApp templates</h1>
          <Link href="/broadcasts" className="text-sm text-brand-700">
            ← Back to broadcasts
          </Link>
        </div>
        <Link href="/broadcasts/templates/new" className="rounded-md bg-brand px-3 py-2 text-sm font-semibold text-white">
          New template
        </Link>
      </div>

      <ul className="mt-4 divide-y divide-gray-100 rounded-md border border-gray-200 bg-white">
        {templates.map((t) => (
          <li key={t.id} className="flex items-center justify-between px-4 py-3">
            <div>
              <Link href={`/broadcasts/templates/${t.id}`} className="font-medium text-brand-700">
                {t.name}
              </Link>
              <div className="mt-0.5 flex gap-1 text-xs text-gray-400">
                <span className="rounded-full bg-gray-100 px-2 py-0.5 capitalize">{t.category}</span>
                <span className="rounded-full bg-gray-100 px-2 py-0.5">{t.language}</span>
              </div>
            </div>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_STYLES[t.metaStatus]}`}>{t.metaStatus}</span>
          </li>
        ))}
        {templates.length === 0 && <li className="px-4 py-6 text-center text-sm text-gray-400">No templates yet.</li>}
      </ul>
    </div>
  );
}
