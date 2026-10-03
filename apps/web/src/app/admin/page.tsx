"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { inr, type AdminIntegrationGroup, type AdminSummary } from "@/lib/admin-types";

export default function AdminOverviewPage() {
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [groups, setGroups] = useState<AdminIntegrationGroup[]>([]);

  useEffect(() => {
    apiFetch<AdminSummary>("/admin/overview").then(setSummary).catch(() => setSummary(null));
    apiFetch<AdminIntegrationGroup[]>("/admin/integrations").then(setGroups).catch(() => setGroups([]));
  }, []);

  const live = groups.filter((g) => g.status !== "coming_soon");
  const ready = live.filter((g) => g.status === "configured").length;
  const days = summary?.windowDays ?? 30;

  const tiles: [string, string | number | undefined][] = [
    ["Workspaces", summary?.workspaces],
    ["Users", summary?.users],
    ["Integrations ready", groups.length ? `${ready} / ${live.length}` : undefined],
    ["Monthly recurring revenue", summary ? inr(summary.mrrInr) : undefined],
    [`Paid invoices, last ${days} days`, summary ? inr(summary.revenueInr) : undefined],
    [`AI provider cost, last ${days} days`, summary ? inr(summary.costInr) : undefined],
    ["Estimated margin", summary ? `${inr(summary.marginInr)}${summary.marginPct === null ? "" : ` (${summary.marginPct}%)`}` : undefined]
  ];

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold text-gray-900">Platform overview</h1>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {tiles.map(([label, value]) => (
          <div key={label} className="rounded-md border border-gray-200 bg-white p-4">
            <p className="text-xs text-gray-500">{label}</p>
            <p className="mt-1 text-xl font-semibold text-gray-900">{value ?? "—"}</p>
          </div>
        ))}
      </div>

      {summary && (
        <p className="mt-4 text-sm text-gray-600">
          Plans: {Object.entries(summary.byPlan).map(([plan, n]) => `${n} ${plan}`).join(" · ")}.{" "}
          <Link href="/admin/workspaces" className="text-brand-700 underline">
            See every workspace
          </Link>
        </p>
      )}
      <p className="mt-2 text-xs text-gray-400">
        Margin is an estimate on a cash basis: paid invoices (before GST) minus AI provider cost at 0.25 per credit. Transcription and meeting costs aren&apos;t tracked yet, and WhatsApp message fees are billed to customers by Meta directly.
      </p>

      <p className="mt-6 text-sm text-gray-600">
        Third-party accounts (Google, Meta, Razorpay, AI, SMS) are configured under{" "}
        <Link href="/admin/integrations" className="text-brand-700 underline">
          Integrations
        </Link>
        . Features that need a missing integration keep working and show a clear &quot;not configured yet&quot; message until you add it.
      </p>
    </div>
  );
}
