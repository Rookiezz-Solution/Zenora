"use client";

import { useEffect, useState } from "react";
import { ADDON_PRICES_INR, PLAN_IDS, PLAN_LABELS, PLAN_LIMITS, TOPUP_PRICES_INR, type PlanId } from "@zenora/shared";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import { apiFetch } from "@/lib/api";
import type { BillingOverview, CheckoutOrderResult, UsageOverview } from "@/lib/billing-types";
import { openRazorpayCheckout } from "@/lib/razorpay-checkout";
import { useCurrentWorkspace } from "@/lib/use-workspace";

const SELF_SERVE_PLANS = PLAN_IDS.filter((p) => p !== "partner") as Exclude<PlanId, "partner">[];

function UsageBar({ label, current, limit }: { label: string; current: number; limit: number | null }) {
  const pct = limit === null ? 0 : Math.min(100, Math.round((current / limit) * 100));
  const over = limit !== null && current > limit;
  return (
    <div>
      <div className="flex justify-between text-xs text-gray-500">
        <span>{label}</span>
        <span>
          {current} / {limit === null ? "∞" : limit}
        </span>
      </div>
      <div className="mt-1 h-2 rounded-full bg-gray-100">
        <div
          className={`h-2 rounded-full ${over ? "bg-red-500" : pct > 80 ? "bg-amber-500" : "bg-brand"}`}
          style={{ width: limit === null ? "6%" : `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default function BillingPage() {
  const { workspaceId } = useCurrentWorkspace();
  const [overview, setOverview] = useState<BillingOverview | null>(null);
  const [usage, setUsage] = useState<UsageOverview | null>(null);
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("monthly");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [profile, setProfile] = useState({ billingName: "", gstin: "", billingAddress: "" });

  function load() {
    if (!workspaceId) return;
    apiFetch<BillingOverview>(`/billing/${workspaceId}`).then((o) => {
      setOverview(o);
      setProfile({ billingName: o.workspace.billingName ?? "", gstin: o.workspace.gstin ?? "", billingAddress: o.workspace.billingAddress ?? "" });
    });
    apiFetch<UsageOverview>(`/billing/${workspaceId}/usage`).then(setUsage);
  }
  useEffect(load, [workspaceId]);

  async function checkoutAndConfirm(body: unknown, description: string) {
    if (!workspaceId) return;
    setBusy(true);
    setMessage(null);
    try {
      const order = await apiFetch<CheckoutOrderResult>(`/billing/${workspaceId}/checkout`, { method: "POST", body: JSON.stringify(body) });
      const result = await openRazorpayCheckout({ orderId: order.razorpayOrderId, amountInr: order.totalInr, description });
      await apiFetch(`/billing/${workspaceId}/confirm`, {
        method: "POST",
        body: JSON.stringify({
          razorpayOrderId: result.razorpay_order_id,
          razorpayPaymentId: result.razorpay_payment_id,
          razorpaySignature: result.razorpay_signature
        })
      });
      setMessage("Payment successful.");
      load();
    } catch (err) {
      setMessage((err as { message?: string }).message ?? "Payment could not be completed");
    } finally {
      setBusy(false);
    }
  }

  async function upgradeTo(planId: PlanId) {
    await checkoutAndConfirm({ kind: "plan", planId, billingCycle }, `${PLAN_LABELS[planId]} plan — ${billingCycle}`);
  }

  async function buyAddon(addonKey: keyof typeof ADDON_PRICES_INR) {
    await checkoutAndConfirm({ kind: "addon", addonKey, quantity: 1 }, addonKey);
  }

  async function buyTopup(topupKey: keyof typeof TOPUP_PRICES_INR) {
    await checkoutAndConfirm({ kind: "topup", topupKey }, topupKey);
  }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!workspaceId) return;
    await apiFetch(`/billing/${workspaceId}/profile`, { method: "POST", body: JSON.stringify(profile) });
    setMessage("Billing details saved.");
  }

  async function cancel() {
    if (!workspaceId || !confirm("Cancel your subscription and move to the Free plan?")) return;
    await apiFetch(`/billing/${workspaceId}/cancel`, { method: "POST" });
    load();
  }

  async function pause() {
    if (!workspaceId) return;
    await apiFetch(`/billing/${workspaceId}/pause`, { method: "POST" });
    load();
  }

  if (!workspaceId || !overview || !usage) return <p className="text-sm text-gray-500">Loading…</p>;

  return (
    <div className="max-w-3xl">
      <SettingsTabs />
      <h1 className="text-2xl font-semibold text-gray-900">Billing and plan</h1>
      <p className="mt-1 text-sm text-gray-500">
        Current plan: <span className="font-medium capitalize text-gray-900">{PLAN_LABELS[usage.planId]}</span>
        {overview.subscription && <span className="ml-2 text-xs text-gray-400">({overview.subscription.status})</span>}
      </p>
      {message && <p className="mt-2 text-sm text-gray-600">{message}</p>}

      <section className="mt-4 space-y-3 rounded-md border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-900">Usage</h2>
        <UsageBar label="Contacts" current={usage.usage.contacts} limit={usage.effectiveLimits.contacts} />
        <UsageBar label="Users" current={usage.usage.users} limit={usage.effectiveLimits.users} />
        <UsageBar label="Instagram accounts" current={usage.usage.instagramAccounts} limit={usage.effectiveLimits.instagramAccounts} />
      </section>

      <section className="mt-4 rounded-md border border-gray-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">Plans</h2>
          <div className="flex gap-1 text-xs">
            <button
              type="button"
              onClick={() => setBillingCycle("monthly")}
              className={`rounded-full px-2 py-1 ${billingCycle === "monthly" ? "bg-brand text-white" : "bg-gray-100 text-gray-600"}`}
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => setBillingCycle("yearly")}
              className={`rounded-full px-2 py-1 ${billingCycle === "yearly" ? "bg-brand text-white" : "bg-gray-100 text-gray-600"}`}
            >
              Yearly (2 months free)
            </button>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {SELF_SERVE_PLANS.map((planId) => {
            const limits = PLAN_LIMITS[planId];
            const isCurrent = usage.planId === planId;
            const price = limits.priceInr === 0 ? "Free" : limits.priceInr === null ? "—" : `₹${limits.priceInr}/mo`;
            return (
              <div key={planId} className={`rounded-md border p-3 ${isCurrent ? "border-brand" : "border-gray-200"}`}>
                <p className="text-sm font-semibold text-gray-900">{PLAN_LABELS[planId]}</p>
                <p className="text-xs text-gray-500">{price}</p>
                <ul className="mt-2 space-y-0.5 text-xs text-gray-500">
                  <li>{limits.users ?? "∞"} users</li>
                  <li>{limits.contacts ?? "∞"} contacts</li>
                  <li>{limits.aiCreditsPerMonth} AI credits/mo</li>
                </ul>
                {isCurrent ? (
                  <p className="mt-2 text-xs font-medium text-brand-700">Current plan</p>
                ) : planId === "free" ? (
                  <button type="button" onClick={cancel} className="mt-2 w-full rounded-md border border-gray-300 px-2 py-1 text-xs">
                    Downgrade
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => upgradeTo(planId)}
                    className="mt-2 w-full rounded-md bg-brand px-2 py-1 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    Upgrade
                  </button>
                )}
              </div>
            );
          })}
        </div>
        {overview.subscription?.status === "active" && (
          <button type="button" onClick={pause} className="mt-3 text-xs text-gray-500 underline">
            Pause subscription
          </button>
        )}
      </section>

      <section className="mt-4 rounded-md border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-900">Add-ons</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          {(Object.keys(ADDON_PRICES_INR) as Array<keyof typeof ADDON_PRICES_INR>).map((key) => (
            <button
              key={key}
              type="button"
              disabled={busy}
              onClick={() => buyAddon(key)}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-xs disabled:opacity-50"
            >
              {key} — ₹{ADDON_PRICES_INR[key]}/mo
            </button>
          ))}
        </div>
      </section>

      <section className="mt-4 rounded-md border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-900">AI credit top-up</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          {(Object.keys(TOPUP_PRICES_INR) as Array<keyof typeof TOPUP_PRICES_INR>).map((key) => (
            <button
              key={key}
              type="button"
              disabled={busy}
              onClick={() => buyTopup(key)}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-xs disabled:opacity-50"
            >
              {key.replace("credits", "")} credits — ₹{TOPUP_PRICES_INR[key]}
            </button>
          ))}
        </div>
      </section>

      <section className="mt-4 rounded-md border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-900">Billing details</h2>
        <form onSubmit={saveProfile} className="mt-2 space-y-2 text-sm">
          <input
            value={profile.billingName}
            onChange={(e) => setProfile({ ...profile, billingName: e.target.value })}
            placeholder="Legal / trade name"
            className="w-full rounded-md border border-gray-300 px-3 py-2"
          />
          <input
            value={profile.gstin}
            onChange={(e) => setProfile({ ...profile, gstin: e.target.value.toUpperCase() })}
            placeholder="GSTIN (optional)"
            className="w-full rounded-md border border-gray-300 px-3 py-2"
          />
          <input
            value={profile.billingAddress}
            onChange={(e) => setProfile({ ...profile, billingAddress: e.target.value })}
            placeholder="Billing address"
            className="w-full rounded-md border border-gray-300 px-3 py-2"
          />
          <button type="submit" className="rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-white">
            Save
          </button>
        </form>
      </section>

      <section className="mt-4 rounded-md border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-900">Invoices</h2>
        <ul className="mt-2 divide-y divide-gray-100">
          {overview.invoices.map((inv) => (
            <li key={inv.id} className="flex items-center justify-between py-1.5 text-sm">
              <span>{inv.description}</span>
              <span className="text-xs text-gray-500">
                ₹{inv.amountInr} + ₹{inv.gstInr} GST · {inv.status} · {new Date(inv.issuedAt).toLocaleDateString()}
              </span>
            </li>
          ))}
          {overview.invoices.length === 0 && <li className="py-3 text-sm text-gray-400">No invoices yet.</li>}
        </ul>
      </section>
    </div>
  );
}
