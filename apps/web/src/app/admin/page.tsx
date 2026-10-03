"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { AdminIntegrationGroup } from "@/lib/admin-types";

export default function AdminOverviewPage() {
  const [counts, setCounts] = useState<{ workspaces: number; users: number } | null>(null);
  const [groups, setGroups] = useState<AdminIntegrationGroup[]>([]);

  useEffect(() => {
    apiFetch<{ workspaces: number; users: number }>("/admin/overview").then(setCounts).catch(() => setCounts(null));
    apiFetch<AdminIntegrationGroup[]>("/admin/integrations").then(setGroups).catch(() => setGroups([]));
  }, []);

  const live = groups.filter((g) => g.status !== "coming_soon");
  const ready = live.filter((g) => g.status === "configured").length;

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold text-gray-900">Platform overview</h1>
      <div className="mt-4 grid grid-cols-3 gap-3">
        {[
          ["Workspaces", counts?.workspaces],
          ["Users", counts?.users],
          ["Integrations ready", groups.length ? `${ready} / ${live.length}` : undefined]
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-md border border-gray-200 bg-white p-4">
            <p className="text-xs text-gray-500">{label}</p>
            <p className="mt-1 text-2xl font-semibold text-gray-900">{value ?? "—"}</p>
          </div>
        ))}
      </div>
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
