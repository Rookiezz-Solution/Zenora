"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DEFAULT_PLAN_CONFIG, PLAN_LABELS, type PlanConfig, type PlanId } from "@zenora/shared";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const SHOWN: PlanId[] = ["free", "starter", "growth", "pro"];

// Public prices come from the live configuration, so this page can never
// disagree with what checkout charges.
export default function PricingPage() {
  const [config, setConfig] = useState<PlanConfig>(DEFAULT_PLAN_CONFIG);
  useEffect(() => {
    fetch(`${API_URL}/public/plans`)
      .then((r) => (r.ok ? (r.json() as Promise<PlanConfig>) : Promise.reject()))
      .then(setConfig)
      .catch(() => undefined);
  }, []);

  const fmt = (n: number | null) => (n === null ? "Unlimited" : n.toLocaleString("en-IN"));

  return (
    <main className="mx-auto max-w-5xl px-5 py-10">
      <Link href="/" className="text-sm text-brand-700">
        ← Zenora
      </Link>
      <h1 className="mt-4 text-3xl font-semibold text-gray-900">Simple pricing</h1>
      <p className="mt-2 text-sm text-gray-500">Start free. Prices are per month, before 18% GST. Yearly billing is two months free. WhatsApp message charges are billed to you by Meta, not by us.</p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {SHOWN.map((id) => {
          const p = config.plans[id];
          return (
            <div key={id} className="flex flex-col rounded-lg border border-gray-200 bg-white p-5">
              <h2 className="text-sm font-semibold text-gray-900">{PLAN_LABELS[id]}</h2>
              <p className="mt-2 text-3xl font-semibold text-gray-900">{p.priceInr === 0 ? "Free" : `₹${(p.priceInr ?? 0).toLocaleString("en-IN")}`}</p>
              {p.priceInr !== 0 && <p className="text-xs text-gray-400">per month + GST</p>}
              <ul className="mt-4 flex-1 space-y-1.5 text-sm text-gray-600">
                <li>{fmt(p.users)} team member{p.users === 1 ? "" : "s"}</li>
                <li>{fmt(p.instagramAccounts)} Instagram account{p.instagramAccounts === 1 ? "" : "s"}</li>
                <li>{fmt(p.contacts)} contacts</li>
                <li>{fmt(p.aiCreditsPerMonth)} AI credits / month</li>
              </ul>
              <Link href="/signup" className="mt-5 rounded-md bg-brand px-3 py-2 text-center text-sm font-semibold text-white">
                {p.priceInr === 0 ? "Start free" : "Get started"}
              </Link>
            </div>
          );
        })}
      </div>

      <section className="mt-10 grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-gray-900">Add-ons</h2>
          <ul className="mt-2 space-y-1 text-sm text-gray-600">
            <li>Extra team member: ₹{config.addonPrices.extraUser}/month</li>
            <li>Extra Instagram account: ₹{config.addonPrices.extraInstagramAccount}/month</li>
            <li>Extra 25,000 contacts: ₹{config.addonPrices.extra25kContacts}/month</li>
          </ul>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-gray-900">AI credit top-ups</h2>
          <ul className="mt-2 space-y-1 text-sm text-gray-600">
            <li>1,000 credits: ₹{config.topupPrices.credits1000.toLocaleString("en-IN")}</li>
            <li>3,000 credits: ₹{config.topupPrices.credits3000.toLocaleString("en-IN")}</li>
            <li>10,000 credits: ₹{config.topupPrices.credits10000.toLocaleString("en-IN")}</li>
          </ul>
        </div>
      </section>

      <footer className="mt-12 flex gap-4 border-t border-gray-200 pt-4 text-xs text-gray-500">
        <Link href="/terms" className="underline">
          Terms of service
        </Link>
        <Link href="/privacy" className="underline">
          Privacy policy
        </Link>
      </footer>
    </main>
  );
}
