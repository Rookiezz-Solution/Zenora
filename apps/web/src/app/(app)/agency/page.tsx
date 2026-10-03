"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, type ApiError } from "@/lib/api";
import type { ClientRow, MyAgency } from "@/lib/agency-types";
import { switchWorkspace, useCurrentWorkspace } from "@/lib/use-workspace";

const input = "rounded-md border border-gray-300 px-2 py-1.5 text-sm";
const button = "rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50";

export default function AgencyPage() {
  const { workspaces, workspaceId, loading } = useCurrentWorkspace();
  const [agency, setAgency] = useState<MyAgency | null | undefined>(undefined);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const [agencyName, setAgencyName] = useState("");
  const [clientName, setClientName] = useState("");
  const [industry, setIndustry] = useState("");
  const [linkId, setLinkId] = useState("");
  const [email, setEmail] = useState("");

  const load = useCallback(() => {
    apiFetch<MyAgency | null>("/agencies/mine")
      .then((a) => {
        setAgency(a);
        if (a) apiFetch<ClientRow[]>(`/agencies/${a.id}/clients`).then(setClients).catch(() => setClients([]));
      })
      .catch(() => setAgency(null));
  }, []);
  useEffect(load, [load]);

  async function run(action: () => Promise<void>, success?: string) {
    setMessage(null);
    try {
      await action();
      if (success) setMessage({ tone: "ok", text: success });
      load();
    } catch (err) {
      setMessage({ tone: "error", text: (err as ApiError).message ?? "Something went wrong" });
    }
  }

  const isOwner = agency?.role === "owner";
  const linked = new Set(clients.map((c) => c.id));
  const linkable = workspaces.filter((w) => !linked.has(w.id));

  if (loading || agency === undefined) return <p className="text-sm text-gray-400">Loading…</p>;

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-semibold text-gray-900">Agency</h1>
      <p className="mt-1 text-sm text-gray-500">Run several client businesses from one login. Each client keeps its own workspace, data and billing: clients pay Zenora directly.</p>

      {message && <p className={`mt-4 rounded-md px-3 py-2 text-sm ${message.tone === "ok" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>{message.text}</p>}

      {agency === null ? (
        <section className="mt-6 rounded-md border border-gray-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-gray-900">Set up your agency</h2>
          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                await apiFetch("/agencies", { method: "POST", body: JSON.stringify({ name: agencyName }) });
              });
            }}
          >
            <input value={agencyName} onChange={(e) => setAgencyName(e.target.value)} placeholder="Agency name" required minLength={2} className={`${input} flex-1`} />
            <button type="submit" className={button}>
              Create agency
            </button>
          </form>
        </section>
      ) : (
        <>
          <p className="mt-4 text-sm text-gray-700">
            <span className="font-semibold">{agency.name}</span> · you are {isOwner ? "the owner" : "an admin"}
          </p>

          <section className="mt-4 rounded-md border border-gray-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-gray-900">Clients</h2>
            {clients.length === 0 ? (
              <p className="mt-2 text-sm text-gray-400">No clients yet.</p>
            ) : (
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs text-gray-500">
                    <tr>
                      <th className="py-1 font-medium">Client</th>
                      <th className="font-medium">Plan</th>
                      <th className="font-medium">Leads</th>
                      <th className="font-medium">New this week</th>
                      <th className="font-medium">Open tasks</th>
                      <th className="font-medium">Overdue</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {clients.map((c) => (
                      <tr key={c.id}>
                        <td className="py-2 font-medium text-gray-900">
                          {c.name}
                          {c.id === workspaceId && <span className="ml-2 text-xs text-gray-400">(current)</span>}
                        </td>
                        <td>{c.planId}</td>
                        <td>{c.leads}</td>
                        <td>{c.newLeads7d}</td>
                        <td>{c.openTasks}</td>
                        <td className={c.overdueTasks > 0 ? "font-semibold text-red-600" : ""}>{c.overdueTasks}</td>
                        <td className="space-x-3 text-right text-xs">
                          {c.id !== workspaceId && (
                            <button type="button" onClick={() => switchWorkspace(c.id)} className="text-brand-700 underline">
                              Open
                            </button>
                          )}
                          {isOwner && (
                            <button type="button" onClick={() => run(async () => void (await apiFetch(`/agencies/${agency.id}/clients/${c.id}`, { method: "DELETE" })), "Client unlinked.")} className="text-red-600 underline">
                              Unlink
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {isOwner && (
              <div className="mt-4 grid gap-4 border-t border-gray-100 pt-4 sm:grid-cols-2">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    run(async () => {
                      await apiFetch(`/agencies/${agency.id}/clients`, { method: "POST", body: JSON.stringify({ name: clientName, industry: industry || undefined }) });
                      setClientName("");
                      setIndustry("");
                    }, "Client workspace created.");
                  }}
                  className="flex flex-col gap-2"
                >
                  <p className="text-xs font-medium text-gray-700">Create a client workspace</p>
                  <input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Client business name" required className={input} />
                  <input value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="Industry (optional)" className={input} />
                  <button type="submit" disabled={!clientName.trim()} className={`${button} self-start`}>
                    Create client
                  </button>
                </form>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    run(async () => {
                      await apiFetch(`/agencies/${agency.id}/clients/link`, { method: "POST", body: JSON.stringify({ workspaceId: linkId }) });
                      setLinkId("");
                    }, "Workspace linked to your agency.");
                  }}
                  className="flex flex-col gap-2"
                >
                  <p className="text-xs font-medium text-gray-700">Link a workspace you own</p>
                  <select value={linkId} onChange={(e) => setLinkId(e.target.value)} className={input}>
                    <option value="">Choose a workspace…</option>
                    {linkable.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-400">Your agency team gets admin access to it. The workspace&apos;s owner can remove the agency at any time.</p>
                  <button type="submit" disabled={!linkId} className={`${button} self-start`}>
                    Link workspace
                  </button>
                </form>
              </div>
            )}
          </section>

          <section className="mt-4 rounded-md border border-gray-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-gray-900">Agency team</h2>
            <p className="mt-1 text-xs text-gray-500">Team members get admin access to every client workspace (not billing or deleting the workspace) and don&apos;t use up the client&apos;s seats.</p>
            <ul className="mt-2 divide-y divide-gray-100">
              {agency.members.map((m) => (
                <li key={m.userId} className="flex items-center justify-between py-2 text-sm">
                  <span>
                    {m.name ?? m.email} <span className="text-xs text-gray-400">{m.email} · {m.role}</span>
                  </span>
                  {isOwner && m.role !== "owner" && (
                    <button type="button" onClick={() => run(async () => void (await apiFetch(`/agencies/${agency.id}/members/${m.userId}`, { method: "DELETE" })), "Team member removed.")} className="text-xs text-red-600 underline">
                      Remove
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {isOwner && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  run(async () => {
                    await apiFetch(`/agencies/${agency.id}/members`, { method: "POST", body: JSON.stringify({ email }) });
                    setEmail("");
                  }, "Team member added.");
                }}
                className="mt-3 flex gap-2 border-t border-gray-100 pt-3"
              >
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Teammate's Zenora email" required className={`${input} flex-1`} />
                <button type="submit" className={button}>
                  Add
                </button>
              </form>
            )}
          </section>
        </>
      )}
    </div>
  );
}
