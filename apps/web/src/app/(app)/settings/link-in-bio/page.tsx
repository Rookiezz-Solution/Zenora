"use client";

import { useEffect, useState } from "react";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import { apiFetch, type ApiError } from "@/lib/api";
import { useCurrentWorkspace } from "@/lib/use-workspace";

interface Form {
  slug: string;
  title: string;
  bio: string;
  whatsappPhone: string;
  brochureUrl: string;
  published: boolean;
}
const EMPTY: Form = { slug: "", title: "", bio: "", whatsappPhone: "", brochureUrl: "", published: false };

export default function LinkInBioSettingsPage() {
  const { workspaceId } = useCurrentWorkspace();
  const [form, setForm] = useState<Form>(EMPTY);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!workspaceId) return;
    apiFetch<Partial<Record<keyof Form, string | boolean | null>> | null>(`/link-in-bio/${workspaceId}`)
      .then((p) => {
        if (!p) return;
        setForm({
          slug: String(p.slug ?? ""),
          title: String(p.title ?? ""),
          bio: String(p.bio ?? ""),
          whatsappPhone: String(p.whatsappPhone ?? ""),
          brochureUrl: String(p.brochureUrl ?? ""),
          published: p.published === true
        });
      })
      .catch(() => undefined);
  }, [workspaceId]);

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!workspaceId) return;
    setMessage(null);
    try {
      await apiFetch(`/link-in-bio/${workspaceId}`, {
        method: "PUT",
        body: JSON.stringify({
          slug: form.slug.trim(),
          title: form.title.trim(),
          bio: form.bio.trim() || null,
          whatsappPhone: form.whatsappPhone.trim() || null,
          brochureUrl: form.brochureUrl.trim() || null,
          published: form.published
        })
      });
      setMessage("Saved.");
    } catch (err) {
      setMessage((err as ApiError).message ?? "Could not save");
    }
  }

  if (!workspaceId) return <p className="text-sm text-gray-500">Log in and create a workspace first.</p>;

  const input = "rounded-md border border-gray-300 px-3 py-2 text-sm";
  const publicUrl = typeof window !== "undefined" && form.slug ? `${window.location.origin}/l/${form.slug}` : null;

  return (
    <div className="max-w-xl">
      <SettingsTabs />
      <h1 className="text-2xl font-semibold text-gray-900">Link in bio</h1>
      <p className="mt-1 text-sm text-gray-500">A public page for your Instagram bio, with a WhatsApp button, brochure and a call-back form.</p>

      <form onSubmit={save} className="mt-6 flex flex-col gap-3 rounded-md border border-gray-200 bg-white p-4">
        <input value={form.slug} onChange={(e) => set("slug", e.target.value)} placeholder="address, e.g. asha-clinic" required className={input} />
        <input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="Page title" required maxLength={80} className={input} />
        <textarea value={form.bio} onChange={(e) => set("bio", e.target.value)} placeholder="Short bio (optional)" rows={2} maxLength={300} className={input} />
        <input value={form.whatsappPhone} onChange={(e) => set("whatsappPhone", e.target.value)} placeholder="WhatsApp number with country code (optional)" className={input} />
        <input value={form.brochureUrl} onChange={(e) => set("brochureUrl", e.target.value)} placeholder="Brochure link, https only (optional)" className={input} />
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={form.published} onChange={(e) => set("published", e.target.checked)} />
          Published (visible to anyone with the link)
        </label>
        <p className="text-xs text-gray-400">
          The call-back form always shows a consent tick box. Each submission becomes a lead with that consent recorded.
        </p>
        <div className="flex items-center gap-3">
          <button type="submit" className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white">
            Save
          </button>
          {message && <span className="text-sm text-gray-600">{message}</span>}
          {publicUrl && form.published && (
            <a href={publicUrl} target="_blank" rel="noreferrer" className="text-sm text-brand-700 underline">
              Open page
            </a>
          )}
        </div>
      </form>
    </div>
  );
}
