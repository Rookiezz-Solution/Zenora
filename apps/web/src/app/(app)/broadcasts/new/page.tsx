"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { AudienceFilter, Broadcast, WaTemplate } from "@/lib/broadcast-types";
import { useCurrentWorkspace } from "@/lib/use-workspace";

export default function NewBroadcastPage() {
  const { workspaceId } = useCurrentWorkspace();
  const router = useRouter();
  const [templates, setTemplates] = useState<WaTemplate[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [tag, setTag] = useState("");
  const [optedInOnly, setOptedInOnly] = useState(true);
  const [skipHours, setSkipHours] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [audienceCount, setAudienceCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!workspaceId) return;
    apiFetch<WaTemplate[]>(`/workspaces/${workspaceId}/templates?scope=approved`)
      .then((rows) => {
        setTemplates(rows);
        setTemplateId((current) => current || rows[0]?.id || "");
      })
      .catch(() => setTemplates([]));
  }, [workspaceId]);

  function buildFilter(): AudienceFilter {
    return {
      ...(tag ? { tag } : {}),
      optedInOnly,
      ...(skipHours ? { skipRecentlyMessagedHours: Number(skipHours) } : {})
    };
  }

  useEffect(() => {
    if (!workspaceId) return;
    const handle = setTimeout(() => {
      apiFetch<{ count: number }>(`/broadcasts/${workspaceId}/estimate`, {
        method: "POST",
        body: JSON.stringify({ audienceFilter: buildFilter() })
      })
        .then((r) => setAudienceCount(r.count))
        .catch(() => setAudienceCount(null));
    }, 300);
    return () => clearTimeout(handle);
  }, [workspaceId, tag, optedInOnly, skipHours]);

  const template = templates.find((t) => t.id === templateId);
  const costPaise = template && audienceCount != null ? estimateCost(template.category, audienceCount) : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!workspaceId || !templateId) return;
    setSaving(true);
    setError(null);
    try {
      const broadcast = await apiFetch<Broadcast>(`/broadcasts/${workspaceId}`, {
        method: "POST",
        body: JSON.stringify({
          templateId,
          audienceFilter: buildFilter(),
          ...(scheduledAt ? { scheduledAt: new Date(scheduledAt).toISOString() } : {})
        })
      });
      router.push(`/broadcasts/${broadcast.id}`);
    } catch (err) {
      setError((err as { message?: string }).message ?? "Could not create broadcast");
    } finally {
      setSaving(false);
    }
  }

  if (!workspaceId) return <p className="text-sm text-gray-500">Log in and create a workspace first.</p>;

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-semibold text-gray-900">New broadcast</h1>
      <Link href="/broadcasts" className="text-sm text-brand-700">
        ← Back to broadcasts
      </Link>

      {templates.length === 0 ? (
        <p className="mt-4 text-sm text-gray-500">
          No approved templates yet.{" "}
          <Link href="/broadcasts/templates/new" className="text-brand-700">
            Create one
          </Link>{" "}
          and wait for Meta approval before broadcasting.
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="mt-4 space-y-4 rounded-md border border-gray-200 bg-white p-4">
          <label className="block text-sm">
            <span className="text-gray-500">Template</span>
            <select
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.category})
                </option>
              ))}
            </select>
          </label>

          <div className="space-y-2 border-t border-gray-100 pt-3">
            <p className="text-sm font-medium text-gray-700">Audience</p>
            <label className="block text-sm">
              <span className="text-gray-500">Only leads tagged (optional)</span>
              <input value={tag} onChange={(e) => setTag(e.target.value)} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={optedInOnly} onChange={(e) => setOptedInOnly(e.target.checked)} />
              <span className="text-gray-700">Only leads with marketing consent</span>
            </label>
            <label className="block text-sm">
              <span className="text-gray-500">Skip leads messaged in the last (hours, optional)</span>
              <input
                type="number"
                min={1}
                value={skipHours}
                onChange={(e) => setSkipHours(e.target.value)}
                className="mt-1 w-32 rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
          </div>

          <div className="rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-700">
            {audienceCount == null ? "Estimating…" : `${audienceCount} leads match`}
            {costPaise != null && ` — ₹${(costPaise / 100).toFixed(2)} estimated cost`}
          </div>

          <label className="block text-sm">
            <span className="text-gray-500">Schedule for later (optional)</span>
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </label>

          {error && <p className="text-sm text-red-600">{error}</p>}
          <button type="submit" disabled={saving} className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {saving ? "Creating…" : "Create broadcast"}
          </button>
        </form>
      )}
    </div>
  );
}

const RATE_PAISE: Record<WaTemplate["category"], number> = { marketing: 86, utility: 12, authentication: 12 };
function estimateCost(category: WaTemplate["category"], count: number) {
  return RATE_PAISE[category] * count;
}
