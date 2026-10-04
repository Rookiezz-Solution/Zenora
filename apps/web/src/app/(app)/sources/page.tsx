"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { apiFetch, type ApiError } from "@/lib/api";
import { formatMoney, sourceLabel, type AdAccountRow, type AdsReport, type AdsSyncResult } from "@/lib/ads-types";
import { useCurrentWorkspace } from "@/lib/use-workspace";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

interface AudiencePreview {
  contacts: number;
  withMarketingConsent: number;
  uploadable: number;
}

function CustomerListCard({ workspaceId }: { workspaceId: string }) {
  const [tag, setTag] = useState("");
  const [preview, setPreview] = useState<AudiencePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const query = tag.trim() ? `?tag=${encodeURIComponent(tag.trim())}` : "";

  useEffect(() => {
    const timer = setTimeout(() => {
      apiFetch<AudiencePreview>(`/audiences/${workspaceId}/preview${query}`).then(setPreview).catch(() => setPreview(null));
    }, 300);
    return () => clearTimeout(timer);
  }, [workspaceId, query]);

  async function download() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/audiences/${workspaceId}/export/meta${query}`, { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { message?: string }).message ?? "Could not create the file");
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = "zenora-meta-customer-list.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-6 rounded-md border border-gray-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-gray-900">Customer list for Meta ads</h2>
      <p className="mt-1 text-xs text-gray-500">
        Make a file of people who agreed to marketing, to upload to Meta Ads Manager (Audiences → Create audience → Customer list) so you can advertise to them or find people like them. Phone numbers are scrambled (hashed) in the file, and nothing is sent to Meta from Zenora.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="Only contacts with this tag (optional)" className="w-64 rounded-md border border-gray-300 px-2 py-1.5 text-sm" />
        <button type="button" onClick={download} disabled={busy || !preview || preview.uploadable === 0} className="rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
          {busy ? "Preparing…" : "Download list"}
        </button>
      </div>
      {preview && (
        <p className="mt-2 text-sm text-gray-700">
          <span className="font-semibold">{preview.uploadable}</span> {preview.uploadable === 1 ? "person" : "people"} can be included, out of {preview.contacts} contact{preview.contacts === 1 ? "" : "s"} with a phone number ({preview.withMarketingConsent} agreed to marketing).
        </p>
      )}
      {preview && preview.withMarketingConsent === 0 && preview.contacts > 0 && (
        <p className="mt-1 text-xs text-amber-800">Nobody has agreed to marketing yet. Open a contact and choose &ldquo;Record that they agreed&rdquo; once they have given permission.</p>
      )}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </section>
  );
}

function SourcesContent() {
  const { workspaceId } = useCurrentWorkspace();
  const params = useSearchParams();
  const [accounts, setAccounts] = useState<AdAccountRow[]>([]);
  const [report, setReport] = useState<AdsReport | null>(null);
  const [days, setDays] = useState(30);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    if (!workspaceId) return;
    apiFetch<AdAccountRow[]>(`/ads/${workspaceId}/accounts`).then(setAccounts).catch(() => setAccounts([]));
    apiFetch<AdsReport>(`/ads/${workspaceId}/report?days=${days}`).then(setReport).catch(() => setReport(null));
  }, [workspaceId, days]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const result = params.get("ads");
    if (result === "connected") setMessage({ tone: "ok", text: "Meta connected. Choose which ad accounts to track below." });
    if (result === "denied") setMessage({ tone: "error", text: "Meta access was not granted, so nothing was connected." });
  }, [params]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setMessage(null);
    try {
      await action();
    } catch (err) {
      setMessage({ tone: "error", text: (err as ApiError).message ?? "Something went wrong" });
    } finally {
      setBusy(false);
    }
  }

  const toggle = (a: AdAccountRow) =>
    run(async () => {
      await apiFetch(`/ads/${workspaceId}/accounts/${a.id}`, { method: "PATCH", body: JSON.stringify({ active: a.status === "inactive" }) });
      await load();
    });

  const disconnect = (a: AdAccountRow) =>
    run(async () => {
      await apiFetch(`/ads/${workspaceId}/accounts/${a.id}`, { method: "DELETE" });
      await load();
    });

  const sync = () =>
    run(async () => {
      const r = await apiFetch<AdsSyncResult>(`/ads/${workspaceId}/sync`, { method: "POST" });
      setMessage(
        r.errors.length
          ? { tone: "error", text: r.errors.map((e) => `${e.account}: ${e.message}`).join(" · ") }
          : { tone: "ok", text: `Synced ${r.rows} daily ad rows from ${r.accounts} account${r.accounts === 1 ? "" : "s"}.` }
      );
      await load();
    });

  if (!workspaceId) return <p className="text-sm text-gray-500">Log in and create a workspace first.</p>;

  const trackedCount = accounts.filter((a) => a.status !== "inactive").length;
  const totalLeads = report?.sources.reduce((n, s) => n + s.leads, 0) ?? 0;

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-semibold text-gray-900">Ads and sources</h1>
      <p className="mt-1 text-sm text-gray-500">See where leads come from and what each Meta campaign costs per lead, booking and sale.</p>

      {message && (
        <p className={`mt-4 rounded-md px-3 py-2 text-sm ${message.tone === "ok" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>{message.text}</p>
      )}

      <section className="mt-6 rounded-md border border-gray-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">Meta ad accounts</h2>
          <div className="flex gap-2">
            <button type="button" onClick={sync} disabled={busy || trackedCount === 0} className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 disabled:opacity-50">
              {busy ? "Working…" : "Sync now"}
            </button>
            <a href={`${API_URL}/ads/${workspaceId}/connect`} className="rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-white">
              {accounts.length ? "Reconnect Meta" : "Connect Meta Ads"}
            </a>
          </div>
        </div>
        {accounts.length === 0 ? (
          <p className="mt-3 text-sm text-gray-500">
            Log in with the Facebook account that manages your ads. Zenora asks for read-only access: it can see spend and results but can never change or create ads.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-gray-100">
            {accounts.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-4 py-2 text-sm">
                <div>
                  <p className="font-medium text-gray-900">{a.name ?? a.externalAccountId}</p>
                  <p className="text-xs text-gray-500">
                    {a.status === "error" ? (
                      <span className="text-red-600">{a.lastError ?? "Needs reconnecting"}</span>
                    ) : a.lastSyncedAt ? (
                      `Last synced ${new Date(a.lastSyncedAt).toLocaleString()}`
                    ) : (
                      "Not synced yet"
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 text-xs text-gray-700">
                    <input type="checkbox" checked={a.status !== "inactive"} disabled={busy} onChange={() => toggle(a)} />
                    Track
                  </label>
                  <button type="button" onClick={() => disconnect(a)} disabled={busy} className="text-xs text-red-600 underline">
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-6 rounded-md border border-gray-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">Campaign performance</h2>
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="rounded-md border border-gray-300 px-2 py-1 text-xs">
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
        </div>
        {!report || report.campaigns.length === 0 ? (
          <p className="mt-3 text-sm text-gray-500">No ad data yet. Track an ad account and press Sync now.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-gray-500">
                <tr>
                  <th className="py-1 pr-3 font-medium">Campaign</th>
                  <th className="px-3 font-medium">Spend</th>
                  <th className="px-3 font-medium">Leads</th>
                  <th className="px-3 font-medium">Cost / lead</th>
                  <th className="px-3 font-medium">Qualified</th>
                  <th className="px-3 font-medium">Cost / qualified</th>
                  <th className="px-3 font-medium">Bookings</th>
                  <th className="px-3 font-medium">Cost / booking</th>
                  <th className="px-3 font-medium">Won</th>
                  <th className="pl-3 font-medium">Cost / sale</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {report.campaigns.map((c) => (
                  <tr key={c.campaignId}>
                    <td className="py-2 pr-3 font-medium text-gray-900">{c.campaignName}</td>
                    <td className="px-3">{formatMoney(c.spendMinor, c.currency)}</td>
                    <td className="px-3">{c.leads}</td>
                    <td className="px-3">{formatMoney(c.costPerLeadMinor, c.currency)}</td>
                    <td className="px-3">{c.qualified}</td>
                    <td className="px-3">{formatMoney(c.costPerQualifiedMinor, c.currency)}</td>
                    <td className="px-3">{c.appointments}</td>
                    <td className="px-3">{formatMoney(c.costPerAppointmentMinor, c.currency)}</td>
                    <td className="px-3">{c.won}</td>
                    <td className="pl-3">{formatMoney(c.costPerWonMinor, c.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {report.unmatchedAdLeads > 0 && (
              <p className="mt-2 text-xs text-gray-500">
                {report.unmatchedAdLeads} lead{report.unmatchedAdLeads === 1 ? "" : "s"} came from ads that are not in a tracked account (or have not synced yet).
              </p>
            )}
          </div>
        )}
      </section>

      <CustomerListCard workspaceId={workspaceId} />

      <section className="mt-6 rounded-md border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-900">Where leads come from</h2>
        {!report || report.sources.length === 0 ? (
          <p className="mt-3 text-sm text-gray-500">No new leads in this period.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {report.sources.map((s) => (
              <li key={s.source} className="text-sm">
                <div className="flex justify-between text-gray-700">
                  <span>{sourceLabel(s.source)}</span>
                  <span>{s.leads}</span>
                </div>
                <div className="mt-1 h-2 rounded bg-gray-100">
                  <div className="h-2 rounded bg-brand" style={{ width: `${Math.round((s.leads / Math.max(1, totalLeads)) * 100)}%` }} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export default function SourcesPage() {
  return (
    <Suspense fallback={null}>
      <SourcesContent />
    </Suspense>
  );
}
