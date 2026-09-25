"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { TemplateBuilderForm, type TemplateFormValues } from "@/components/broadcasts/template-builder-form";
import { apiFetch } from "@/lib/api";
import type { WaTemplate } from "@/lib/broadcast-types";
import { useCurrentWorkspace } from "@/lib/use-workspace";

const STATUS_STYLES: Record<WaTemplate["metaStatus"], string> = {
  pending: "bg-amber-100 text-amber-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700"
};

export default function WaTemplateDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { workspaceId } = useCurrentWorkspace();
  const [template, setTemplate] = useState<WaTemplate | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function load() {
    if (!workspaceId) return;
    apiFetch<WaTemplate>(`/workspaces/${workspaceId}/templates/${id}`).then(setTemplate).catch(() => setTemplate(null));
  }
  useEffect(load, [workspaceId, id]);

  async function handleSave(values: TemplateFormValues) {
    if (!workspaceId) return;
    const { name: _name, ...update } = values;
    await apiFetch(`/workspaces/${workspaceId}/templates/${id}`, { method: "PATCH", body: JSON.stringify(update) });
    setMessage("Saved.");
    load();
  }

  async function submit() {
    if (!workspaceId) return;
    setBusy(true);
    setMessage(null);
    try {
      await apiFetch(`/workspaces/${workspaceId}/templates/${id}/submit`, { method: "POST" });
      setMessage("Submitted to Meta for review.");
      load();
    } catch (err) {
      setMessage((err as { message?: string }).message ?? "Could not submit template");
    } finally {
      setBusy(false);
    }
  }

  async function sync() {
    if (!workspaceId) return;
    setBusy(true);
    setMessage(null);
    try {
      await apiFetch(`/workspaces/${workspaceId}/templates/${id}/sync`, { method: "POST" });
      setMessage("Status refreshed.");
      load();
    } catch (err) {
      setMessage((err as { message?: string }).message ?? "Could not refresh status");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!workspaceId || !confirm("Delete this template?")) return;
    await apiFetch(`/workspaces/${workspaceId}/templates/${id}`, { method: "DELETE" });
    router.push("/broadcasts/templates");
  }

  if (!workspaceId || !template) return <p className="text-sm text-gray-500">Loading…</p>;

  const submitted = !!template.submittedAt;

  return (
    <div className="max-w-xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">{template.name}</h1>
          <Link href="/broadcasts/templates" className="text-sm text-brand-700">
            ← Back to templates
          </Link>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_STYLES[template.metaStatus]}`}>
          {template.metaStatus}
        </span>
      </div>

      {template.rejectionReason && (
        <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">Rejected: {template.rejectionReason}</p>
      )}
      {message && <p className="mt-2 text-sm text-gray-600">{message}</p>}

      <div className="mt-4 flex gap-2">
        {!submitted && (
          <button type="button" onClick={submit} disabled={busy} className="rounded-md bg-brand px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">
            Submit to Meta
          </button>
        )}
        {submitted && (
          <button type="button" onClick={sync} disabled={busy} className="rounded-md border border-gray-300 px-3 py-1.5 text-sm">
            Refresh status
          </button>
        )}
        {!submitted && (
          <button type="button" onClick={remove} className="rounded-md border border-red-200 px-3 py-1.5 text-sm text-red-600">
            Delete
          </button>
        )}
      </div>
      {submitted && <p className="mt-2 text-xs text-gray-400">Submitted templates can&apos;t be edited or deleted — Meta reviews the version it received.</p>}

      <div className="mt-4">
        {submitted ? (
          <div className="space-y-2 rounded-md border border-gray-200 bg-white p-4 text-sm">
            <p>
              <span className="text-gray-500">Category:</span> <span className="capitalize">{template.category}</span>
            </p>
            <p>
              <span className="text-gray-500">Language:</span> {template.language}
            </p>
            {template.headerText && (
              <p>
                <span className="text-gray-500">Header:</span> {template.headerText}
              </p>
            )}
            <p className="whitespace-pre-wrap">
              <span className="text-gray-500">Body:</span> {template.bodyText}
            </p>
            {template.footerText && (
              <p>
                <span className="text-gray-500">Footer:</span> {template.footerText}
              </p>
            )}
          </div>
        ) : (
          <TemplateBuilderForm
            key={template.id}
            initial={{
              name: template.name,
              category: template.category,
              language: template.language,
              headerType: template.headerType,
              headerText: template.headerText ?? "",
              bodyText: template.bodyText,
              footerText: template.footerText ?? "",
              buttons: template.buttons
            }}
            nameLocked
            onSubmit={handleSave}
            submitLabel="Save changes"
          />
        )}
      </div>
    </div>
  );
}
