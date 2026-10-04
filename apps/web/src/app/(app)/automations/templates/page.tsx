"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch, type ApiError } from "@/lib/api";
import type { Automation, FlowTemplate } from "@/lib/automation-types";
import { useCurrentWorkspace } from "@/lib/use-workspace";
import { NoWorkspace } from "@/components/no-workspace";

type Scope = "all" | "mine" | "agency" | "public";

const SCOPE_LABELS: Record<Scope, string> = { all: "All", mine: "My templates", agency: "Shared by agency", public: "Public gallery" };
const ORIGIN_LABELS: Record<FlowTemplate["origin"], string> = { mine: "Mine", agency: "From your agency", community: "Community", zenora: "By Zenora" };

export default function FlowTemplatesGalleryPage() {
  const { workspaceId, loading: workspaceLoading } = useCurrentWorkspace();
  const [templates, setTemplates] = useState<FlowTemplate[]>([]);
  const [scope, setScope] = useState<Scope>("all");
  const [industry, setIndustry] = useState("");
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  function load() {
    if (!workspaceId) return;
    const params = new URLSearchParams({ scope });
    if (industry) params.set("industry", industry);
    apiFetch<FlowTemplate[]>(`/flow-templates/${workspaceId}?${params}`).then(setTemplates).catch(() => setTemplates([]));
  }
  useEffect(load, [workspaceId, scope, industry]);

  async function act(path: string, body: unknown, success: string) {
    setMessage(null);
    try {
      await apiFetch(`/flow-templates/${workspaceId}/${path}`, { method: "POST", body: JSON.stringify(body ?? {}) });
      setMessage({ tone: "ok", text: success });
      load();
    } catch (err) {
      const e = err as ApiError & { body?: { issues?: { kind: string; sample: string }[] } };
      const issues = e.body?.issues?.map((i) => `${i.kind} (${i.sample})`).join(", ");
      setMessage({ tone: "error", text: `${e.message ?? "Something went wrong"}${issues ? ` Found: ${issues}.` : ""}` });
    }
  }

  async function useTemplate(template: FlowTemplate) {
    if (!workspaceId) return;
    const name = prompt("Name this automation:", template.name);
    if (!name) return;
    const automation = await apiFetch<Automation>(`/flow-templates/${workspaceId}/${template.id}/use`, {
      method: "POST",
      body: JSON.stringify({ name })
    });
    window.location.href = `/automations/${automation.id}`;
  }

  async function createBlank() {
    if (!workspaceId) return;
    const name = prompt("Template name:");
    if (!name) return;
    const template = await apiFetch<FlowTemplate>(`/flow-templates/${workspaceId}`, {
      method: "POST",
      body: JSON.stringify({ name, graph: { startBlockId: "", blocks: {} } })
    });
    window.location.href = `/automations/templates/${template.id}`;
  }

  if (!workspaceId) return <NoWorkspace loading={workspaceLoading} />;

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Flow templates</h1>
          <Link href="/automations" className="text-sm text-brand-700">
            ← Back to automations
          </Link>
        </div>
        <button type="button" onClick={createBlank} className="rounded-md bg-brand px-3 py-2 text-sm font-semibold text-white">
          New template
        </button>
      </div>

      {message && <p className={`mt-4 rounded-md px-3 py-2 text-sm ${message.tone === "ok" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>{message.text}</p>}

      <div className="mt-4 flex flex-wrap gap-2">
        {(Object.keys(SCOPE_LABELS) as Scope[]).map((s) => (
          <button key={s} type="button" onClick={() => setScope(s)} className={`rounded-full px-3 py-1 text-xs font-medium ${scope === s ? "bg-brand text-white" : "bg-gray-100 text-gray-600"}`}>
            {SCOPE_LABELS[s]}
          </button>
        ))}
        <select value={industry} onChange={(e) => setIndustry(e.target.value)} className="rounded-md border border-gray-300 px-2 py-1 text-xs">
          <option value="">All industries</option>
          <option value="coaching">Coaching</option>
          <option value="clinic">Clinic</option>
          <option value="salon">Salon</option>
          <option value="real_estate">Real estate</option>
          <option value="d2c">D2C</option>
          <option value="travel">Travel</option>
          <option value="creator">Creator</option>
          <option value="local_services">Local services</option>
          <option value="agency">Agency</option>
          <option value="other">Other</option>
        </select>
      </div>

      <ul className="mt-4 divide-y divide-gray-100 rounded-md border border-gray-200 bg-white">
        {templates.map((t) => (
          <li key={t.id} className="px-4 py-3">
            <div className="flex items-center justify-between">
              <div>
                {t.origin === "mine" ? (
                  <Link href={`/automations/templates/${t.id}`} className="font-medium text-brand-700">
                    {t.name}
                  </Link>
                ) : (
                  <span className="font-medium text-gray-900">{t.name}</span>
                )}
                <div className="mt-0.5 flex flex-wrap gap-1 text-xs text-gray-400">
                  {t.industry && <span className="rounded-full bg-gray-100 px-2 py-0.5">{t.industry}</span>}
                  <span className="rounded-full bg-gray-100 px-2 py-0.5">{ORIGIN_LABELS[t.origin]}</span>
                  {t.origin === "mine" && t.scope === "agency" && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-blue-700">Shared with your agency</span>}
                  {t.origin === "mine" && t.scope === "public" && <span className="rounded-full bg-green-50 px-2 py-0.5 text-green-800">Public</span>}
                  {t.origin === "mine" && t.publishStatus === "pending" && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-800">Waiting for review</span>}
                  {t.origin === "mine" && t.publishStatus === "rejected" && <span className="rounded-full bg-red-50 px-2 py-0.5 text-red-700">Not published{t.publishNote ? `: ${t.publishNote}` : ""}</span>}
                </div>
              </div>
              <button type="button" onClick={() => useTemplate(t)} className="rounded-md border border-gray-300 px-3 py-1.5 text-sm">
                Use template
              </button>
            </div>

            {t.origin === "mine" && (
              <div className="mt-2 flex flex-wrap gap-3 text-xs">
                {t.scope === "agency" ? (
                  <button type="button" onClick={() => act(`${t.id}/share`, { scope: "private" }, "Now private.")} className="text-gray-600 underline">
                    Stop sharing with agency
                  </button>
                ) : (
                  t.scope === "private" && (
                    <button type="button" onClick={() => act(`${t.id}/share`, { scope: "agency" }, "Shared with your agency.")} className="text-gray-600 underline">
                      Share with my agency
                    </button>
                  )
                )}
                {t.scope !== "public" && t.publishStatus !== "pending" && (
                  <button type="button" onClick={() => act(`${t.id}/request-publish`, {}, "Sent for review. It becomes public once approved.")} className="text-brand-700 underline">
                    Publish to the public gallery…
                  </button>
                )}
                {(t.scope === "public" || t.publishStatus === "pending") && (
                  <button type="button" onClick={() => act(`${t.id}/withdraw-publish`, {}, "Withdrawn from the public gallery.")} className="text-red-600 underline">
                    {t.scope === "public" ? "Remove from public gallery" : "Withdraw request"}
                  </button>
                )}
              </div>
            )}
          </li>
        ))}
        {templates.length === 0 && <li className="px-4 py-6 text-center text-sm text-gray-400">No templates found.</li>}
      </ul>
      <p className="mt-3 text-xs text-gray-400">Public templates are reviewed by Zenora first, and can&apos;t contain phone numbers or email addresses. Editing a public template takes it back to private.</p>
    </div>
  );
}
