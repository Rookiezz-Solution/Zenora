"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { Automation, FlowTemplate } from "@/lib/automation-types";
import { useCurrentWorkspace } from "@/lib/use-workspace";

type Scope = "all" | "mine" | "public";

export default function FlowTemplatesGalleryPage() {
  const { workspaceId } = useCurrentWorkspace();
  const [templates, setTemplates] = useState<FlowTemplate[]>([]);
  const [scope, setScope] = useState<Scope>("all");
  const [industry, setIndustry] = useState("");

  function load() {
    if (!workspaceId) return;
    const params = new URLSearchParams({ scope });
    if (industry) params.set("industry", industry);
    apiFetch<FlowTemplate[]>(`/flow-templates/${workspaceId}?${params}`).then(setTemplates).catch(() => setTemplates([]));
  }
  useEffect(load, [workspaceId, scope, industry]);

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

  if (!workspaceId) return <p className="text-sm text-gray-500">Log in and create a workspace first.</p>;

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

      <div className="mt-4 flex gap-2">
        {(["all", "mine", "public"] as Scope[]).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setScope(s)}
            className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${
              scope === s ? "bg-brand text-white" : "bg-gray-100 text-gray-600"
            }`}
          >
            {s}
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
          <li key={t.id} className="flex items-center justify-between px-4 py-3">
            <div>
              {t.workspaceId ? (
                <Link href={`/automations/templates/${t.id}`} className="font-medium text-brand-700">
                  {t.name}
                </Link>
              ) : (
                <span className="font-medium text-gray-900">{t.name}</span>
              )}
              <div className="mt-0.5 flex gap-1 text-xs text-gray-400">
                {t.industry && <span className="rounded-full bg-gray-100 px-2 py-0.5">{t.industry}</span>}
                <span className="rounded-full bg-gray-100 px-2 py-0.5">{t.workspaceId ? "mine" : "public"}</span>
              </div>
            </div>
            <button type="button" onClick={() => useTemplate(t)} className="rounded-md border border-gray-300 px-3 py-1.5 text-sm">
              Use template
            </button>
          </li>
        ))}
        {templates.length === 0 && <li className="px-4 py-6 text-center text-sm text-gray-400">No templates found.</li>}
      </ul>
    </div>
  );
}
