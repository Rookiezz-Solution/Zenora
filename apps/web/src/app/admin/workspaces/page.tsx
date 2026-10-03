"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { inr, type AdminWorkspaceRow } from "@/lib/admin-types";

export default function AdminWorkspacesPage() {
  const [rows, setRows] = useState<AdminWorkspaceRow[] | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      const query = search.trim() ? `?search=${encodeURIComponent(search.trim())}` : "";
      apiFetch<AdminWorkspaceRow[]>(`/admin/workspaces${query}`).then(setRows).catch(() => setRows([]));
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);

  return (
    <div className="max-w-5xl">
      <h1 className="text-2xl font-semibold text-gray-900">Workspaces</h1>
      <p className="mt-1 text-sm text-gray-500">Usage and estimated margin for the last 30 days. Showing the newest 100.</p>

      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name" className="mt-4 w-64 rounded-md border border-gray-300 px-2 py-1.5 text-sm" />

      <div className="mt-4 overflow-x-auto rounded-md border border-gray-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-200 text-xs text-gray-500">
            <tr>
              <th className="px-3 py-2 font-medium">Workspace</th>
              <th className="px-3 font-medium">Plan</th>
              <th className="px-3 font-medium">Members</th>
              <th className="px-3 font-medium">Contacts</th>
              <th className="px-3 font-medium">Credits used</th>
              <th className="px-3 font-medium">Revenue</th>
              <th className="px-3 font-medium">AI cost</th>
              <th className="px-3 font-medium">Margin</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {(rows ?? []).map((w) => (
              <tr key={w.id} className="hover:bg-gray-50">
                <td className="px-3 py-2">
                  <Link href={`/admin/workspaces/${w.id}`} className="font-medium text-brand-700 underline">
                    {w.name}
                  </Link>
                  {w.hasOverride && <span className="ml-2 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">Custom limits</span>}
                </td>
                <td className="px-3">
                  {w.planId}
                  {w.status !== "active" && <span className="ml-1 text-xs text-gray-400">({w.status})</span>}
                </td>
                <td className="px-3">{w.members}</td>
                <td className="px-3">{w.contacts.toLocaleString("en-IN")}</td>
                <td className="px-3">{w.creditsUsed.toLocaleString("en-IN")}</td>
                <td className="px-3">{inr(w.revenueInr)}</td>
                <td className="px-3">{inr(w.costInr)}</td>
                <td className={`px-3 ${w.marginInr < 0 ? "text-red-600" : ""}`}>
                  {inr(w.marginInr)}
                  {w.marginPct !== null && <span className="ml-1 text-xs text-gray-400">{w.marginPct}%</span>}
                </td>
              </tr>
            ))}
            {rows && rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-gray-400">
                  No workspaces found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
