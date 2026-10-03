"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { digitsOnly, dueBucket, matchesFilter, type DueBucket, type MobileFilter, type MobileLead } from "@/lib/mobile-leads";
import { useCurrentWorkspace } from "@/lib/use-workspace";

const FILTERS: { key: MobileFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "due_now", label: "Due now" },
  { key: "today", label: "Today" },
  { key: "overdue", label: "Overdue" }
];

const CHIP: Record<DueBucket, { label: string; cls: string } | null> = {
  overdue: { label: "Overdue", cls: "bg-amber-50 text-amber-800" },
  due_now: { label: "Due now", cls: "bg-red-50 text-red-700" },
  today: { label: "Today", cls: "bg-gray-100 text-gray-600" },
  later: null,
  none: null
};

export default function MobileLeadsPage() {
  const { workspaceId, loading } = useCurrentWorkspace();
  const [leads, setLeads] = useState<MobileLead[] | null>(null);
  const [filter, setFilter] = useState<MobileFilter>("all");

  useEffect(() => {
    if (!workspaceId) return;
    apiFetch<MobileLead[]>(`/leads/${workspaceId}/mine`).then(setLeads).catch(() => setLeads([]));
  }, [workspaceId]);

  const visible = (leads ?? []).filter((l) => matchesFilter(l, filter));
  const count = (f: MobileFilter) => (leads ?? []).filter((l) => matchesFilter(l, f)).length;

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-gray-50">
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white px-4 pb-3 pt-4">
        <h1 className="text-xl font-semibold text-gray-900">My leads</h1>
        <div className="mt-3 flex gap-2 overflow-x-auto">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${filter === f.key ? "bg-brand text-white" : "bg-gray-100 text-gray-600"}`}
            >
              {f.label} · {count(f.key)}
            </button>
          ))}
        </div>
      </header>

      <main className="flex-1 space-y-3 p-4 pb-20">
        {!loading && !workspaceId && <p className="text-sm text-gray-500">Log in to see your leads.</p>}
        {leads === null && workspaceId && <p className="text-sm text-gray-400">Loading…</p>}
        {leads !== null && visible.length === 0 && <p className="text-sm text-gray-400">Nothing here.</p>}
        {visible.map((lead) => {
          const task = lead.tasks[0];
          const chip = CHIP[dueBucket(task?.dueAt)];
          const phone = digitsOnly(lead.phone);
          const detail = [task?.title, lead.stage?.name, ...lead.tags.map((t) => t.tag.name)].filter(Boolean).join(" · ");
          return (
            <div key={lead.id} className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium text-gray-900">{lead.name || lead.phone || "Unnamed lead"}</p>
                {chip && <span className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-semibold ${chip.cls}`}>{chip.label}</span>}
              </div>
              {detail && <p className="mt-1 text-xs text-gray-500">{detail}</p>}
              <div className="mt-3 flex gap-2">
                {phone ? (
                  <>
                    <a href={`tel:+${phone}`} className="flex-1 rounded-lg border border-gray-300 py-2 text-center text-sm font-semibold text-gray-800">
                      Call
                    </a>
                    <a
                      href={`https://wa.me/${phone}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex-1 rounded-lg border border-gray-300 py-2 text-center text-sm font-semibold text-gray-800"
                    >
                      WhatsApp
                    </a>
                  </>
                ) : (
                  <span className="flex-1 py-2 text-center text-xs text-gray-400">No phone on file</span>
                )}
                <Link href={`/leads/${lead.id}`} className="flex-1 rounded-lg bg-brand py-2 text-center text-sm font-semibold text-white">
                  Open
                </Link>
              </div>
            </div>
          );
        })}
      </main>

      <nav className="fixed inset-x-0 bottom-0 mx-auto flex max-w-md justify-around border-t border-gray-200 bg-white py-3 text-xs font-medium text-gray-600">
        <span className="text-brand-700">Leads</span>
        <Link href="/inbox">Inbox</Link>
        <Link href="/tasks">Tasks</Link>
      </nav>
    </div>
  );
}
