"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { inr } from "@/lib/admin-types";
import type { ReferralOverview } from "@/lib/referral-types";

export default function ReferralsPage() {
  const [data, setData] = useState<ReferralOverview | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    apiFetch<ReferralOverview>("/referrals/me").then(setData).catch(() => setData(null));
  }, []);

  if (!data) return <p className="text-sm text-gray-400">Loading…</p>;
  const link = `${window.location.origin}/r/${data.code}`;

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold text-gray-900">Refer and earn</h1>
      <p className="mt-1 text-sm text-gray-500">
        Earn {data.terms.pct}% of what each business you refer pays Zenora (before GST) for {data.terms.months} months from the day they join. Payouts are made monthly against your GST invoice.
      </p>

      <section className="mt-6 rounded-md border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-900">Your link</h2>
        <div className="mt-2 flex items-center gap-2">
          <code className="min-w-0 flex-1 break-all rounded bg-gray-50 px-2 py-1.5 text-xs">{link}</code>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard?.writeText(link).then(() => setCopied(true)).catch(() => undefined);
            }}
            className="rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-white"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <p className="mt-2 text-xs text-gray-500">
          Code <span className="font-mono">{data.code}</span>. The link is remembered for 30 days after someone clicks it. You can&apos;t earn on a business you belong to yourself.
        </p>
      </section>

      <div className="mt-4 grid grid-cols-3 gap-3">
        {[
          ["Businesses referred", String(data.referrals.length)],
          ["Owed to you", inr(data.accruedInr)],
          ["Paid so far", inr(data.paidInr)]
        ].map(([label, value]) => (
          <div key={label} className="rounded-md border border-gray-200 bg-white p-4">
            <p className="text-xs text-gray-500">{label}</p>
            <p className="mt-1 text-xl font-semibold text-gray-900">{value}</p>
          </div>
        ))}
      </div>

      <section className="mt-4 rounded-md border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-900">Referred businesses</h2>
        {data.referrals.length === 0 ? (
          <p className="mt-2 text-sm text-gray-400">No one has signed up through your link yet.</p>
        ) : (
          <table className="mt-2 w-full text-left text-sm">
            <thead className="text-xs text-gray-500">
              <tr>
                <th className="py-1 font-medium">Business</th>
                <th className="font-medium">Joined</th>
                <th className="font-medium">Plan</th>
                <th className="font-medium">You earned</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.referrals.map((r) => (
                <tr key={r.id}>
                  <td className="py-2 font-medium text-gray-900">{r.businessName}</td>
                  <td>{new Date(r.joinedAt).toLocaleDateString()}</td>
                  <td>
                    {r.planId}
                    {r.status !== "active" && <span className="ml-1 text-xs text-gray-400">({r.status})</span>}
                  </td>
                  <td>{inr(r.earnedInr)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="mt-4 rounded-md border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-900">Payouts</h2>
        {data.payouts.length === 0 ? (
          <p className="mt-2 text-sm text-gray-400">No payouts yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-gray-100 text-sm">
            {data.payouts.map((p) => (
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
