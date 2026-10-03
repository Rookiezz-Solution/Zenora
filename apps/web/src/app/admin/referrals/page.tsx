"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, type ApiError } from "@/lib/api";
import { inr } from "@/lib/admin-types";
import type { OwedOverview, OwedRow } from "@/lib/referral-types";

const input = "rounded-md border border-gray-300 px-2 py-1.5 text-sm";

export default function AdminReferralsPage() {
  const [data, setData] = useState<OwedOverview | null>(null);
  const [paying, setPaying] = useState<OwedRow | null>(null);
  const [reference, setReference] = useState("");
  const [invoiceRef, setInvoiceRef] = useState("");
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const load = useCallback(() => {
    apiFetch<OwedOverview>("/admin/referrals").then(setData).catch(() => setData(null));
  }, []);
  useEffect(load, [load]);

  async function record(e: React.FormEvent) {
    e.preventDefault();
    if (!paying) return;
    setMessage(null);
    try {
      await apiFetch("/admin/referrals/payouts", { method: "POST", body: JSON.stringify({ referrerUserId: paying.userId, reference, partnerInvoiceRef: invoiceRef || undefined }) });
      setMessage({ tone: "ok", text: `Recorded ${inr(paying.amountInr)} paid to ${paying.email}.` });
      setPaying(null);
      setReference("");
      setInvoiceRef("");
      load();
    } catch (err) {
      setMessage({ tone: "error", text: (err as ApiError).message ?? "Could not record the payout" });
    }
  }

  if (!data) return <p className="text-sm text-gray-400">Loading…</p>;

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold text-gray-900">Referral payouts</h1>
      <p className="mt-1 text-sm text-gray-500">
        Commission is {data.terms.pct}% of each referred business&apos;s invoices before GST, for {data.terms.months} months. Zenora only keeps the ledger: pay the person yourself (against their GST invoice), then record it here.
      </p>

      {message && <p className={`mt-4 rounded-md px-3 py-2 text-sm ${message.tone === "ok" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>{message.text}</p>}

      <section className="mt-6 rounded-md border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-900">Owed now</h2>
        {data.owed.length === 0 ? (
          <p className="mt-2 text-sm text-gray-400">Nothing is owed to anyone.</p>
        ) : (
          <ul className="mt-2 divide-y divide-gray-100 text-sm">
            {data.owed.map((o) => (
              <li key={o.userId} className="flex items-center justify-between py-2">
                <span>
                  {o.name ?? o.email} <span className="text-xs text-gray-400">{o.email} · {o.entries} invoice{o.entries === 1 ? "" : "s"}</span>
                </span>
                <span className="flex items-center gap-3">
                  <span className="font-semibold">{inr(o.amountInr)}</span>
                  <button type="button" onClick={() => setPaying(o)} className="text-xs text-brand-700 underline">
                    Record payment
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}

        {paying && (
          <form onSubmit={record} className="mt-3 flex flex-col gap-2 rounded-md bg-gray-50 p-3">
            <p className="text-xs text-gray-700">
              You are recording that you have paid <span className="font-semibold">{inr(paying.amountInr)}</span> to {paying.email}. This settles all {paying.entries} commissions currently owed to them.
            </p>
            <input required minLength={3} value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Payment reference (e.g. bank UTR)" className={input} />
            <input value={invoiceRef} onChange={(e) => setInvoiceRef(e.target.value)} placeholder="Their GST invoice number (optional)" className={input} />
            <div className="flex gap-3">
              <button type="submit" className="rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-white">
                Confirm payment made
              </button>
              <button type="button" onClick={() => setPaying(null)} className="text-xs text-gray-500 underline">
                Cancel
              </button>
            </div>
          </form>
        )}
      </section>

      <section className="mt-4 rounded-md border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-900">Recent payouts</h2>
        {data.recentPayouts.length === 0 ? (
          <p className="mt-2 text-sm text-gray-400">None recorded.</p>
        ) : (
          <ul className="mt-2 divide-y divide-gray-100 text-sm">
            {data.recentPayouts.map((p) => (
              <li key={p.id} className="flex justify-between py-1.5">
                <span>
                  {inr(p.amountInr)} <span className="text-xs text-gray-400">ref {p.reference}{p.partnerInvoiceRef ? ` · invoice ${p.partnerInvoiceRef}` : ""}</span>
                </span>
                <span className="text-xs text-gray-400">{new Date(p.createdAt).toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
