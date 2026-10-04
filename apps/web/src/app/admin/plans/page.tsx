"use client";

import { useCallback, useEffect, useState } from "react";
import { EDITABLE_PLAN_FIELDS, EDITABLE_PLAN_IDS, PLAN_LABELS, type EditablePlanField, type PlanConfig, type PlanConfigOverrides } from "@zenora/shared";
import { apiFetch, type ApiError } from "@/lib/api";

interface PlansState {
  defaults: PlanConfig;
  overrides: PlanConfigOverrides;
  effective: PlanConfig;
  workspacesByPlan: Record<string, number>;
}

interface Preview {
  issues: string[];
  changes: { label: string; before: number | null; after: number | null }[];
  requiresConfirmation: boolean;
  blocked: { label: string; workspaces: number }[];
}

const FIELD_LABELS: Record<EditablePlanField, string> = { priceInr: "Price ₹/month", users: "Users", instagramAccounts: "Instagram accounts", contacts: "Contacts", aiCreditsPerMonth: "AI credits/month" };
const input = "w-24 rounded-md border border-gray-300 px-2 py-1 text-sm";

type Draft = { plans: Record<string, Record<string, string>>; addons: Record<string, string>; topups: Record<string, string> };

function toDraft(c: PlanConfig): Draft {
  return {
    plans: Object.fromEntries(EDITABLE_PLAN_IDS.map((id) => [id, Object.fromEntries(EDITABLE_PLAN_FIELDS.map((f) => [f, String(c.plans[id][f] ?? "")]))])),
    addons: Object.fromEntries(Object.entries(c.addonPrices).map(([k, v]) => [k, String(v)])),
    topups: Object.fromEntries(Object.entries(c.topupPrices).map(([k, v]) => [k, String(v)]))
  };
}

// Sends the values that differ from the shipped defaults.
function toOverrides(draft: Draft, defaults: PlanConfig): PlanConfigOverrides {
  const out: PlanConfigOverrides = {};
  for (const id of EDITABLE_PLAN_IDS) {
    for (const f of EDITABLE_PLAN_FIELDS) {
      const n = Number(draft.plans[id]![f]);
      if (n !== defaults.plans[id][f]) ((out.plans ??= {})[id] ??= {})[f] = n;
    }
  }
  for (const [k, v] of Object.entries(draft.addons)) if (Number(v) !== defaults.addonPrices[k as keyof PlanConfig["addonPrices"]]) (out.addonPrices ??= {})[k as keyof PlanConfig["addonPrices"]] = Number(v);
  for (const [k, v] of Object.entries(draft.topups)) if (Number(v) !== defaults.topupPrices[k as keyof PlanConfig["topupPrices"]]) (out.topupPrices ??= {})[k as keyof PlanConfig["topupPrices"]] = Number(v);
  return out;
}

export default function AdminPlansPage() {
  const [state, setState] = useState<PlansState | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [note, setNote] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const load = useCallback(() => {
    apiFetch<PlansState>("/admin/plans").then((s) => {
      setState(s);
      setDraft(toDraft(s.effective));
      setPreview(null);
      setConfirmed(false);
    });
  }, []);
  useEffect(load, [load]);

  if (!state || !draft) return <p className="text-sm text-gray-400">Loading…</p>;

  const overrides = toOverrides(draft, state.defaults);

  async function review() {
    setMessage(null);
    try {
      setPreview(await apiFetch<Preview>("/admin/plans/preview", { method: "POST", body: JSON.stringify({ overrides }) }));
    } catch (err) {
      setMessage({ tone: "error", text: (err as ApiError).message ?? "Could not check the changes" });
    }
  }

  async function save() {
    setMessage(null);
    try {
      await apiFetch("/admin/plans", { method: "PUT", body: JSON.stringify({ overrides, note: note || undefined, confirmLargePriceChange: confirmed }) });
      setMessage({ tone: "ok", text: "Saved. New prices apply to purchases started from now on." });
      setNote("");
      load();
    } catch (err) {
      setMessage({ tone: "error", text: (err as ApiError).message ?? "Could not save" });
    }
  }

  async function reset() {
    if (!window.confirm("Put every plan price and limit back to the shipped defaults?")) return;
    setMessage(null);
    try {
      await apiFetch("/admin/plans", { method: "DELETE" });
      setMessage({ tone: "ok", text: "Back to the defaults." });
      load();
    } catch (err) {
      setMessage({ tone: "error", text: (err as ApiError).message ?? "Could not reset" });
    }
  }

  const set = (fn: (d: Draft) => void) => {
    const next = structuredClone(draft);
    fn(next);
    setDraft(next);
    setPreview(null);
    setConfirmed(false);
  };

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-semibold text-gray-900">Plans and pricing</h1>
      <p className="mt-1 text-sm text-gray-500">
        A new price applies to purchases started <strong>after</strong> you save: anyone already paid keeps what they paid, and the price a customer was shown is locked into their checkout. Limits can be raised freely; lowering one is refused while any workspace on that plan is above the new figure. Every change is recorded.
      </p>

      {message && <p className={`mt-4 rounded-md px-3 py-2 text-sm ${message.tone === "ok" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>{message.text}</p>}

      <section className="mt-6 overflow-x-auto rounded-md border border-gray-200 bg-white p-4">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-gray-500">
            <tr>
              <th className="py-1 font-medium">Plan</th>
              {EDITABLE_PLAN_FIELDS.map((f) => (
                <th key={f} className="font-medium">{FIELD_LABELS[f]}</th>
              ))}
              <th className="font-medium">Workspaces</th>
            </tr>
          </thead>
          <tbody>
            {EDITABLE_PLAN_IDS.map((id) => (
              <tr key={id} className="border-t border-gray-100">
                <td className="py-2 font-medium text-gray-900">{PLAN_LABELS[id]}</td>
                {EDITABLE_PLAN_FIELDS.map((f) => (
                  <td key={f}>
                    <input type="number" value={draft.plans[id]![f]} onChange={(e) => set((d) => void (d.plans[id]![f] = e.target.value))} className={input} />
                    {state.defaults.plans[id][f] !== state.effective.plans[id][f] && <span className="ml-1 text-[10px] text-amber-700">was {state.defaults.plans[id][f]}</span>}
                  </td>
                ))}
                <td>{state.workspacesByPlan[id] ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-gray-400">Free and Partner can&apos;t be edited here. Prices are before GST (18% is added at checkout).</p>
      </section>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <section className="rounded-md border border-gray-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-gray-900">Add-ons (₹/month)</h2>
          {Object.keys(draft.addons).map((k) => (
            <label key={k} className="mt-2 flex items-center justify-between text-sm text-gray-700">
              {k}
              <input type="number" value={draft.addons[k]} onChange={(e) => set((d) => void (d.addons[k] = e.target.value))} className={input} />
            </label>
          ))}
        </section>
        <section className="rounded-md border border-gray-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-gray-900">AI credit top-ups (₹)</h2>
          {Object.keys(draft.topups).map((k) => (
            <label key={k} className="mt-2 flex items-center justify-between text-sm text-gray-700">
              {k.replace("credits", "")} credits
              <input type="number" value={draft.topups[k]} onChange={(e) => set((d) => void (d.topups[k] = e.target.value))} className={input} />
            </label>
          ))}
        </section>
      </div>

      <section className="mt-4 rounded-md border border-gray-200 bg-white p-4">
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="Why (shown in the history), e.g. Diwali pricing" className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm" />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button type="button" onClick={review} className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700">
            Review changes
          </button>
          <button type="button" onClick={save} disabled={!preview || preview.issues.length > 0 || preview.blocked.length > 0 || preview.changes.length === 0 || (preview.requiresConfirmation && !confirmed)} className="rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
            Save
          </button>
          <button type="button" onClick={reset} className="text-xs text-red-600 underline">
            Reset everything to defaults
          </button>
        </div>

        {preview && (
          <div className="mt-3 text-sm">
            {preview.issues.map((i) => (
              <p key={i} className="text-red-700">• {i}</p>
            ))}
            {preview.blocked.map((b) => (
              <p key={b.label} className="text-red-700">• Can&apos;t lower {b.label}: {b.workspaces} workspace{b.workspaces === 1 ? " is" : "s are"} already above it.</p>
            ))}
            {preview.changes.length === 0 && preview.issues.length === 0 && <p className="text-gray-500">Nothing would change.</p>}
            {preview.changes.map((c) => (
              <p key={c.label} className="text-gray-700">
                {c.label}: <span className="text-gray-400">{c.before ?? "unlimited"}</span> → <span className="font-semibold">{c.after ?? "unlimited"}</span>
              </p>
            ))}
            {preview.requiresConfirmation && (
              <label className="mt-2 flex items-center gap-2 text-amber-800">
                <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
                A price changes by more than 25%. I&apos;ve checked it is right.
              </label>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
