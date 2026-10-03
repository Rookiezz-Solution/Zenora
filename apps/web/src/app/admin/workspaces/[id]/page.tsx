"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { apiFetch, type ApiError } from "@/lib/api";
import { inr, limitText, type AdminWorkspaceDetail } from "@/lib/admin-types";

const LIMITS = [
  { key: "contacts", label: "Contacts", used: "contacts" },
  { key: "users", label: "Team members", used: "users" },
  { key: "instagramAccounts", label: "Instagram accounts", used: "instagramAccounts" }
] as const;

type LimitKey = (typeof LIMITS)[number]["key"];
const input = "rounded-md border border-gray-300 px-2 py-1.5 text-sm";
const button = "rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50";

export default function AdminWorkspacePage() {
  const { id } = useParams<{ id: string }>();
  const [ws, setWs] = useState<AdminWorkspaceDetail | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [drafts, setDrafts] = useState<Record<LimitKey, string>>({ contacts: "", users: "", instagramAccounts: "" });
  const [note, setNote] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");

  const load = useCallback(() => {
    apiFetch<AdminWorkspaceDetail>(`/admin/workspaces/${id}`)
      .then((w) => {
        setWs(w);
        setDrafts({
          contacts: w.override?.contacts?.toString() ?? "",
          users: w.override?.users?.toString() ?? "",
          instagramAccounts: w.override?.instagramAccounts?.toString() ?? ""
        });
        setNote(w.override?.note ?? "");
      })
      .catch((err: ApiError) => setMessage({ tone: "error", text: err.message ?? "Could not load" }));
  }, [id]);
  useEffect(load, [load]);

  async function saveLimits(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    const body: Record<string, number | string | null> = { note: note.trim() || null };
    for (const { key } of LIMITS) body[key] = drafts[key].trim() === "" ? null : Number(drafts[key]);
    try {
      setWs(await apiFetch<AdminWorkspaceDetail>(`/admin/workspaces/${id}/limits`, { method: "PUT", body: JSON.stringify(body) }));
      setMessage({ tone: "ok", text: "Limits saved." });
      load();
    } catch (err) {
      setMessage({ tone: "error", text: (err as ApiError).message ?? "Could not save" });
    }
  }

  async function grant(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    try {
      const r = await apiFetch<{ balance: number }>(`/admin/workspaces/${id}/credits`, { method: "POST", body: JSON.stringify({ amount: Number(amount), reason }) });
      setMessage({ tone: "ok", text: `Credits granted. Balance is now ${r.balance.toLocaleString("en-IN")}.` });
      setAmount("");
      setReason("");
      load();
    } catch (err) {
      setMessage({ tone: "error", text: (err as ApiError).message ?? "Could not grant" });
    }
  }

  if (!ws) return <p className="text-sm text-gray-400">{message?.text ?? "Loading…"}</p>;

  return (
    <div className="max-w-3xl">
      <Link href="/admin/workspaces" className="text-xs text-gray-500 underline">
        All workspaces
      </Link>
      <h1 className="mt-1 text-2xl font-semibold text-gray-900">{ws.name}</h1>
      <p className="mt-1 text-sm text-gray-500">
        {ws.planId} plan{ws.subscription ? ` · ${ws.subscription.status}` : ""} · created {new Date(ws.createdAt).toLocaleDateString()} · owner {ws.owners.map((o) => o.email).join(", ") || "unknown"}
      </p>

      {message && <p className={`mt-4 rounded-md px-3 py-2 text-sm ${message.tone === "ok" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>{message.text}</p>}

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          [`Revenue, ${ws.windowDays}d`, inr(ws.revenueInr)],
          ["AI cost", inr(ws.costInr)],
          ["Margin", `${inr(ws.marginInr)}${ws.marginPct === null ? "" : ` (${ws.marginPct}%)`}`],
          ["AI credits left", ws.current.aiCreditsRemaining.toLocaleString("en-IN")]
        ].map(([label, value]) => (
          <div key={label} className="rounded-md border border-gray-200 bg-white p-3">
            <p className="text-xs text-gray-500">{label}</p>
            <p className="mt-1 text-lg font-semibold text-gray-900">{value}</p>
          </div>
        ))}
      </div>

      <section className="mt-6 rounded-md border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-900">Limits</h2>
        <p className="mt-1 text-xs text-gray-500">
          Leave a box empty to use the plan (plus any add-ons they bought). A number replaces it for this workspace only. The plan itself and its price are not changed.
        </p>
        <form onSubmit={saveLimits} className="mt-3">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-gray-500">
              <tr>
                <th className="py-1 font-medium">Limit</th>
                <th className="font-medium">In use</th>
                <th className="font-medium">Plan</th>
                <th className="font-medium">Applies now</th>
                <th className="font-medium">Override</th>
              </tr>
            </thead>
            <tbody>
              {LIMITS.map(({ key, label, used }) => (
                <tr key={key} className="border-t border-gray-100">
                  <td className="py-2">{label}</td>
                  <td>{ws.current[used].toLocaleString("en-IN")}</td>
                  <td>{limitText(ws.plan[key])}</td>
                  <td className={ws.override?.[key] != null ? "font-semibold text-amber-800" : ""}>{limitText(ws.effectiveLimits[key])}</td>
                  <td>
                    <input type="number" min={0} value={drafts[key]} onChange={(e) => setDrafts({ ...drafts, [key]: e.target.value })} placeholder="plan default" className={`${input} w-32`} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note, e.g. why (shown in the history)" maxLength={200} className={`${input} mt-3 w-full`} />
          <button type="submit" className={`${button} mt-3`}>
            Save limits
          </button>
        </form>
      </section>

      <section className="mt-4 rounded-md border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-900">Grant AI credits</h2>
        <p className="mt-1 text-xs text-gray-500">Adds to their balance right away. The reason is recorded in the history.</p>
        <form onSubmit={grant} className="mt-3 flex flex-wrap gap-2">
          <input type="number" min={1} max={100000} required value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Credits" className={`${input} w-28`} />
          <input required minLength={3} maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason" className={`${input} min-w-0 flex-1`} />
          <button type="submit" disabled={!amount || reason.trim().length < 3} className={button}>
            Grant
          </button>
        </form>
      </section>

      <section className="mt-4 rounded-md border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-900">Usage, last {ws.windowDays} days</h2>
        {ws.usageByType.length === 0 ? (
          <p className="mt-2 text-sm text-gray-400">Nothing recorded.</p>
        ) : (
          <ul className="mt-2 text-sm text-gray-700">
            {ws.usageByType.map((u) => (
              <li key={u.type} className="flex justify-between border-t border-gray-100 py-1 first:border-0">
                <span className="font-mono text-xs">{u.type}</span>
                <span>{u.quantity.toLocaleString("en-IN")}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-4 rounded-md border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-900">History</h2>
        {ws.audit.length === 0 ? (
          <p className="mt-2 text-sm text-gray-400">No changes made from this console.</p>
        ) : (
          <ul className="mt-2 text-sm">
            {ws.audit.map((a) => (
              <li key={a.id} className="border-t border-gray-100 py-1.5 first:border-0">
                <span className="font-mono text-xs text-gray-500">{a.action}</span> {a.detail}
                <span className="ml-2 text-xs text-gray-400">{new Date(a.createdAt).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
