"use client";

import { useEffect, useState } from "react";
import { MESSAGE_RETENTION_OPTIONS_DAYS } from "@zenora/shared";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import { apiFetch, type ApiError } from "@/lib/api";
import { useCurrentWorkspace } from "@/lib/use-workspace";

interface PersonRow {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
}

interface EraseCounts {
  leads: number;
  conversations: number;
  messages: number;
  tasks: number;
  appointments: number;
  webhookDeliveries: number;
  rawEvents: number;
}

const input = "rounded-md border border-gray-300 px-2 py-1.5 text-sm";

export default function PrivacyPage() {
  const { workspaceId } = useCurrentWorkspace();
  const [retention, setRetention] = useState<number | null | undefined>(undefined);
  const [query, setQuery] = useState("");
  const [people, setPeople] = useState<PersonRow[] | null>(null);
  const [erasing, setErasing] = useState<PersonRow | null>(null);
  const [typed, setTyped] = useState("");
  const [deletion, setDeletion] = useState<{ scheduledFor: string | null; graceDays: number } | null>(null);
  const [wsName, setWsName] = useState("");
  const [confirmWs, setConfirmWs] = useState("");
  const [confirmEmail, setConfirmEmail] = useState("");
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (!workspaceId) return;
    apiFetch<{ messageRetentionDays: number | null }>(`/privacy/${workspaceId}/retention`)
      .then((r) => setRetention(r.messageRetentionDays))
      .catch(() => setRetention(undefined));
  }, [workspaceId]);

  useEffect(() => {
    if (!workspaceId) return;
    apiFetch<{ scheduledFor: string | null; graceDays: number }>(`/privacy/${workspaceId}/deletion`).then(setDeletion).catch(() => setDeletion(null));
    apiFetch<{ name: string }>(`/workspaces/${workspaceId}`).then((w) => setWsName(w.name)).catch(() => setWsName(""));
  }, [workspaceId]);

  async function run(action: () => Promise<void>) {
    setMessage(null);
    try {
      await action();
    } catch (err) {
      setMessage({ tone: "error", text: (err as ApiError).message ?? "Something went wrong" });
    }
  }

  const saveRetention = (value: number | null) =>
    run(async () => {
      await apiFetch(`/privacy/${workspaceId}/retention`, { method: "PUT", body: JSON.stringify({ messageRetentionDays: value }) });
      setRetention(value);
      setMessage({ tone: "ok", text: value === null ? "Messages will be kept until you delete them." : `Messages older than ${value} days will be deleted daily.` });
    });

  const search = (e: React.FormEvent) => {
    e.preventDefault();
    return run(async () => {
      setPeople(await apiFetch<PersonRow[]>(`/leads/${workspaceId}?search=${encodeURIComponent(query.trim())}`));
    });
  };

  const download = (p: PersonRow) =>
    run(async () => {
      const data = await apiFetch<unknown>(`/privacy/${workspaceId}/leads/${p.id}/export`);
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `zenora-data-${p.id}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });

  const erase = () =>
    run(async () => {
      if (!erasing) return;
      const counts = await apiFetch<EraseCounts>(`/privacy/${workspaceId}/leads/${erasing.id}/erase`, { method: "POST", body: JSON.stringify({ confirm: true }) });
      setMessage({ tone: "ok", text: `Erased. Removed ${counts.messages} messages, ${counts.conversations} conversations, ${counts.tasks} tasks and ${counts.appointments} appointments.` });
      setPeople((list) => list?.filter((p) => p.id !== erasing.id) ?? null);
      setErasing(null);
      setTyped("");
    });

  const [exporting, setExporting] = useState(false);
  async function downloadEverything() {
    setExporting(true);
    setMessage(null);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"}/privacy/${workspaceId}/export`, { credentials: "include" });
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { message?: string }).message ?? "Could not prepare the download");
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `zenora-export-${workspaceId}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setMessage({ tone: "error", text: (err as Error).message });
    } finally {
      setExporting(false);
    }
  }

  const scheduleDeletion = () =>
    run(async () => {
      setDeletion(await apiFetch(`/privacy/${workspaceId}/deletion`, { method: "POST", body: JSON.stringify({ confirmName: confirmWs }) }));
      setConfirmWs("");
      setMessage({ tone: "ok", text: "Deletion scheduled. You can cancel until then." });
    });

  const cancelDeletion = () =>
    run(async () => {
      setDeletion(await apiFetch(`/privacy/${workspaceId}/deletion`, { method: "DELETE" }));
      setMessage({ tone: "ok", text: "Deletion cancelled. Nothing was removed." });
    });

  const deleteAccount = () =>
    run(async () => {
      await apiFetch("/account", { method: "DELETE", body: JSON.stringify({ confirmEmail }) });
      window.localStorage.removeItem("zenora.workspaceId");
      window.location.assign("/login");
    });

  if (!workspaceId) return <p className="text-sm text-gray-500">Log in and create a workspace first.</p>;

  return (
    <div className="max-w-3xl">
      <SettingsTabs />
      <h1 className="text-2xl font-semibold text-gray-900">Privacy</h1>
      <p className="mt-1 text-sm text-gray-500">Give someone a copy of their data, erase it when they ask, and decide how long conversations are kept.</p>

      {message && <p className={`mt-4 rounded-md px-3 py-2 text-sm ${message.tone === "ok" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>{message.text}</p>}

      <section className="mt-6 rounded-md border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-900">How long to keep messages</h2>
        <p className="mt-1 text-xs text-gray-500">Older messages are deleted automatically every day. Leads, notes and tasks are not affected.</p>
        <select
          value={retention === undefined ? "" : (retention ?? "keep")}
          disabled={retention === undefined}
          onChange={(e) => saveRetention(e.target.value === "keep" ? null : Number(e.target.value))}
          className={`${input} mt-3`}
        >
          <option value="keep">Keep until I delete them</option>
          {MESSAGE_RETENTION_OPTIONS_DAYS.map((d) => (
            <option key={d} value={d}>
              Delete after {d} days
            </option>
          ))}
        </select>
        <p className="mt-2 text-xs text-gray-400">Separately, Zenora removes raw channel payloads and webhook delivery logs after 30 days.</p>
      </section>

      <section className="mt-4 rounded-md border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-900">Find a person</h2>
        <form onSubmit={search} className="mt-3 flex gap-2">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name, phone or email" required className={`${input} flex-1`} />
          <button type="submit" className="rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-white">
            Search
          </button>
        </form>

        {people && people.length === 0 && <p className="mt-3 text-sm text-gray-400">No one matches.</p>}
        <ul className="mt-2 divide-y divide-gray-100">
          {(people ?? []).map((p) => (
            <li key={p.id} className="flex items-center justify-between py-2 text-sm">
              <span>
                {p.name ?? "No name"} <span className="text-xs text-gray-400">{[p.phone, p.email].filter(Boolean).join(" · ")}</span>
              </span>
              <span className="flex gap-3 text-xs">
                <button type="button" onClick={() => download(p)} className="text-brand-700 underline">
                  Download data
                </button>
                <button type="button" onClick={() => { setErasing(p); setTyped(""); }} className="text-red-600 underline">
                  Erase…
                </button>
              </span>
            </li>
          ))}
        </ul>

        {erasing && (
          <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3">
            <p className="text-sm font-medium text-red-900">Erase {erasing.name ?? erasing.phone ?? erasing.email}?</p>
            <p className="mt-1 text-xs text-red-800">
              This permanently deletes the person, their conversations and messages, notes, tasks, bookings, consent records and the copies kept in webhook logs. It can&apos;t be undone. It does not remove events already added to a Google Calendar, data held by Meta, or invoices.
            </p>
            <div className="mt-2 flex items-center gap-2">
              <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Type ERASE to confirm" className={`${input} w-48`} />
              <button type="button" disabled={typed !== "ERASE"} onClick={erase} className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
                Erase permanently
              </button>
              <button type="button" onClick={() => setErasing(null)} className="text-xs text-gray-600 underline">
                Cancel
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="mt-6 rounded-md border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-900">Download everything</h2>
        <p className="mt-1 text-xs text-gray-500">
          One file with your contacts, conversations, notes, tasks, bookings, automations, templates and invoices. Passwords, access tokens and keys are never included. Only an owner can download it, once every ten minutes.
        </p>
        <button type="button" onClick={downloadEverything} disabled={exporting} className="mt-3 rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
          {exporting ? "Preparing…" : "Download everything"}
        </button>
      </section>

      <section className="mt-4 rounded-md border border-red-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-red-800">Delete this workspace</h2>
        {deletion?.scheduledFor ? (
          <>
            <p className="mt-1 text-sm text-gray-700">
              Scheduled for deletion on <span className="font-semibold">{new Date(deletion.scheduledFor).toLocaleString()}</span>.
            </p>
            <button type="button" onClick={cancelDeletion} className="mt-3 rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-white">
              Cancel deletion
            </button>
          </>
        ) : (
          <>
            <p className="mt-1 text-xs text-gray-600">
              Permanently removes every contact, conversation, message, automation and setting, and disconnects your channels. It happens {deletion?.graceDays ?? 7} days after you confirm, and you can cancel until then. Your invoices are kept separately for tax purposes, and there is no refund for the current plan. Only an owner can do this.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input value={confirmWs} onChange={(e) => setConfirmWs(e.target.value)} placeholder={wsName ? `Type "${wsName}" to confirm` : "Type the workspace name"} className={`${input} w-64`} />
              <button type="button" disabled={!wsName || confirmWs !== wsName} onClick={scheduleDeletion} className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
                Schedule deletion
              </button>
            </div>
          </>
        )}
      </section>

      <section className="mt-4 rounded-md border border-red-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-red-800">Delete my account</h2>
        <p className="mt-1 text-xs text-gray-600">Removes your login and your place in every workspace. You can&apos;t do this while you are the only owner of a workspace: delete it, or make someone else an owner, first.</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input value={confirmEmail} onChange={(e) => setConfirmEmail(e.target.value)} placeholder="Type your email to confirm" className={`${input} w-64`} />
          <button type="button" disabled={confirmEmail.length < 3} onClick={deleteAccount} className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
            Delete my account
          </button>
        </div>
      </section>
    </div>
  );
}
