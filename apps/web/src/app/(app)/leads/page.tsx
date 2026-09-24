"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { Lead } from "@/lib/lead-types";
import { useCurrentWorkspace } from "@/lib/use-workspace";

export default function LeadsPage() {
  const { workspaceId } = useCurrentWorkspace();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", email: "" });
  const [error, setError] = useState<string | null>(null);

  function load() {
    if (!workspaceId) return;
    const query = search ? `?search=${encodeURIComponent(search)}` : "";
    apiFetch<Lead[]>(`/leads/${workspaceId}${query}`)
      .then(setLeads)
      .catch(() => setLeads([]));
  }

  useEffect(load, [workspaceId, search]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!workspaceId) return;
    setError(null);
    try {
      await apiFetch(`/leads/${workspaceId}`, { method: "POST", body: JSON.stringify(form) });
      setForm({ name: "", phone: "", email: "" });
      setShowAdd(false);
      load();
    } catch (err) {
      const e2 = err as { message?: string; status?: number };
      setError(e2.status === 409 ? "A lead with this phone or email already exists." : e2.message ?? "Could not add lead");
    }
  }

  if (!workspaceId) {
    return <p className="text-sm text-gray-500">Log in and create a workspace first.</p>;
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Leads</h1>
        <div className="flex gap-2">
          <Link href="/leads/import" className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700">
            Import
          </Link>
          <button
            type="button"
            onClick={() => setShowAdd((v) => !v)}
            className="rounded-md bg-brand px-3 py-2 text-sm font-semibold text-white"
          >
            Add lead
          </button>
        </div>
      </div>

      {showAdd && (
        <form onSubmit={handleAdd} className="mt-4 flex flex-wrap items-end gap-2 rounded-md border border-gray-200 bg-white p-4">
          <input
            placeholder="Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <input
            placeholder="Phone"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <input
            placeholder="Email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <button type="submit" className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white">
            Save
          </button>
          {error && <p className="w-full text-sm text-red-600">{error}</p>}
        </form>
      )}

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search leads by name, phone or email"
        className="mt-4 w-full max-w-md rounded-md border border-gray-300 px-3 py-2 text-sm"
      />

      <table className="mt-4 w-full text-left text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-xs uppercase text-gray-500">
            <th className="py-2 pr-4">Name</th>
            <th className="py-2 pr-4">Phone</th>
            <th className="py-2 pr-4">Email</th>
            <th className="py-2 pr-4">Source</th>
            <th className="py-2 pr-4">Tags</th>
          </tr>
        </thead>
        <tbody>
          {leads.map((lead) => (
            <tr key={lead.id} className="border-b border-gray-100 hover:bg-gray-50">
              <td className="py-2 pr-4">
                <Link href={`/leads/${lead.id}`} className="font-medium text-brand-700">
                  {lead.name || "—"}
                </Link>
              </td>
              <td className="py-2 pr-4 text-gray-600">{lead.phone || "—"}</td>
              <td className="py-2 pr-4 text-gray-600">{lead.email || "—"}</td>
              <td className="py-2 pr-4 text-gray-600">{lead.source || "—"}</td>
              <td className="py-2 pr-4">
                <div className="flex flex-wrap gap-1">
                  {lead.tags.map((t) => (
                    <span key={t.tag.id} className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                      {t.tag.name}
                    </span>
                  ))}
                </div>
              </td>
            </tr>
          ))}
          {leads.length === 0 && (
            <tr>
              <td colSpan={5} className="py-6 text-center text-gray-400">
                No leads yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
