"use client";

import { useCallback, useEffect, useState } from "react";
import { API_KEY_SCOPES, WEBHOOK_EVENTS, WEBHOOK_EVENT_LABELS } from "@zenora/shared";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import { apiFetch, type ApiError } from "@/lib/api";
import {
  DELIVERY_STATUS_STYLES,
  SCOPE_LABELS,
  type ApiKeyRow,
  type CreatedApiKey,
  type CreatedWebhook,
  type DeliveryRow,
  type WebhookRow
} from "@/lib/developer-types";
import { useCurrentWorkspace } from "@/lib/use-workspace";
import { NoWorkspace } from "@/components/no-workspace";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const input = "rounded-md border border-gray-300 px-2 py-1.5 text-sm";
const button = "rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50";
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : "never");

function SecretBanner({ title, value, onDismiss }: { title: string; value: string; onDismiss: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm">
      <p className="font-medium text-amber-900">{title}</p>
      <p className="mt-1 text-xs text-amber-800">Copy it now. For security it is shown only once and can&apos;t be recovered later.</p>
      <div className="mt-2 flex items-center gap-2">
        <code className="min-w-0 flex-1 break-all rounded bg-white px-2 py-1.5 text-xs">{value}</code>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard?.writeText(value).then(() => setCopied(true)).catch(() => undefined);
          }}
          className="rounded-md border border-amber-300 px-2 py-1 text-xs font-medium text-amber-900"
        >
          {copied ? "Copied" : "Copy"}
        </button>
        <button type="button" onClick={onDismiss} className="text-xs text-amber-900 underline">
          Done
        </button>
      </div>
    </div>
  );
}

function Deliveries({ workspaceId, webhookId }: { workspaceId: string; webhookId: string }) {
  const [rows, setRows] = useState<DeliveryRow[] | null>(null);
  const load = useCallback(() => {
    apiFetch<DeliveryRow[]>(`/developers/${workspaceId}/webhooks/${webhookId}/deliveries`).then(setRows).catch(() => setRows([]));
  }, [workspaceId, webhookId]);
  useEffect(load, [load]);

  return (
    <div className="mt-2 rounded-md bg-gray-50 p-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-gray-600">Recent deliveries</p>
        <button type="button" onClick={load} className="text-xs text-gray-500 underline">
          Refresh
        </button>
      </div>
      {rows && rows.length === 0 && <p className="mt-1 text-xs text-gray-400">Nothing sent yet. Use &ldquo;Send test&rdquo;.</p>}
      <ul className="mt-1 divide-y divide-gray-100">
        {(rows ?? []).map((d) => (
          <li key={d.id} className="flex flex-wrap items-center gap-2 py-1 text-xs">
            <span className={`rounded px-1.5 py-0.5 font-medium ${DELIVERY_STATUS_STYLES[d.status]}`}>{d.status}</span>
            <span className="font-mono text-gray-700">{d.event}</span>
            <span className="text-gray-400">
              {d.attempts} attempt{d.attempts === 1 ? "" : "s"} · {fmt(d.createdAt)}
            </span>
            {d.error && <span className="text-red-600">{d.error}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function DevelopersPage() {
  const { workspaceId, loading: workspaceLoading } = useCurrentWorkspace();
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [hooks, setHooks] = useState<WebhookRow[]>([]);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [newKey, setNewKey] = useState<CreatedApiKey | null>(null);
  const [newSecret, setNewSecret] = useState<CreatedWebhook | null>(null);
  const [openDeliveries, setOpenDeliveries] = useState<string | null>(null);

  const [keyName, setKeyName] = useState("");
  const [scopes, setScopes] = useState<string[]>(["leads:read"]);
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [events, setEvents] = useState<string[]>(["lead.created"]);

  const load = useCallback(() => {
    if (!workspaceId) return;
    apiFetch<ApiKeyRow[]>(`/developers/${workspaceId}/api-keys`).then(setKeys).catch(() => setKeys([]));
    apiFetch<WebhookRow[]>(`/developers/${workspaceId}/webhooks`).then(setHooks).catch(() => setHooks([]));
  }, [workspaceId]);
  useEffect(load, [load]);

  async function run(action: () => Promise<void>) {
    setMessage(null);
    try {
      await action();
    } catch (err) {
      setMessage({ tone: "error", text: (err as ApiError).message ?? "Something went wrong" });
    }
  }

  const createKey = (e: React.FormEvent) => {
    e.preventDefault();
    return run(async () => {
      setNewKey(await apiFetch<CreatedApiKey>(`/developers/${workspaceId}/api-keys`, { method: "POST", body: JSON.stringify({ name: keyName, scopes }) }));
      setKeyName("");
      load();
    });
  };

  const revokeKey = (id: string) =>
    run(async () => {
      await apiFetch(`/developers/${workspaceId}/api-keys/${id}`, { method: "DELETE" });
      load();
    });

  const createHook = (e: React.FormEvent) => {
    e.preventDefault();
    return run(async () => {
      setNewSecret(await apiFetch<CreatedWebhook>(`/developers/${workspaceId}/webhooks`, { method: "POST", body: JSON.stringify({ url, events, description: description || undefined }) }));
      setUrl("");
      setDescription("");
      load();
    });
  };

  const toggleHook = (h: WebhookRow) =>
    run(async () => {
      await apiFetch(`/developers/${workspaceId}/webhooks/${h.id}`, { method: "PATCH", body: JSON.stringify({ active: !h.active }) });
      load();
    });

  const deleteHook = (id: string) =>
    run(async () => {
      await apiFetch(`/developers/${workspaceId}/webhooks/${id}`, { method: "DELETE" });
      load();
    });

  const testHook = (id: string) =>
    run(async () => {
      await apiFetch(`/developers/${workspaceId}/webhooks/${id}/test`, { method: "POST" });
      setMessage({ tone: "ok", text: "Test event queued. Refresh the deliveries in a few seconds." });
      setOpenDeliveries(id);
    });

  const toggle = (list: string[], value: string, set: (v: string[]) => void) => set(list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);

  if (!workspaceId) return <NoWorkspace loading={workspaceLoading} />;

  return (
    <div className="max-w-3xl">
      <SettingsTabs />
      <h1 className="text-2xl font-semibold text-gray-900">Developers</h1>
      <p className="mt-1 text-sm text-gray-500">Connect Zenora to your own tools: read and create leads through the API, and get a call to your server when something happens.</p>

      {message && <p className={`mt-4 rounded-md px-3 py-2 text-sm ${message.tone === "ok" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>{message.text}</p>}

      <section className="mt-6 rounded-md border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-900">API keys</h2>
        <p className="mt-1 text-xs text-gray-500">
          A key gives access to this workspace&apos;s leads. Treat it like a password and revoke it if it leaks.
        </p>
        {newKey && <SecretBanner title={`New key “${newKey.name}”`} value={newKey.key} onDismiss={() => setNewKey(null)} />}

        <ul className="mt-3 divide-y divide-gray-100">
          {keys.map((k) => (
            <li key={k.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <div className={k.revokedAt ? "opacity-50" : ""}>
                <p className="font-medium text-gray-900">
                  {k.name} <span className="font-mono text-xs text-gray-400">{k.prefix}…</span>
                </p>
                <p className="text-xs text-gray-500">
                  {k.scopes.map((s) => SCOPE_LABELS[s] ?? s).join(", ")} · last used {fmt(k.lastUsedAt)}
                  {k.revokedAt && " · revoked"}
                </p>
              </div>
              {!k.revokedAt && (
                <button type="button" onClick={() => revokeKey(k.id)} className="text-xs text-red-600 underline">
                  Revoke
                </button>
              )}
            </li>
          ))}
          {keys.length === 0 && <li className="py-2 text-sm text-gray-400">No API keys yet.</li>}
        </ul>

        <form onSubmit={createKey} className="mt-3 flex flex-col gap-2 border-t border-gray-100 pt-3">
          <input value={keyName} onChange={(e) => setKeyName(e.target.value)} placeholder="Name, e.g. Zapier" required maxLength={60} className={input} />
          <div className="flex flex-wrap gap-3 text-xs text-gray-700">
            {API_KEY_SCOPES.map((s) => (
              <label key={s} className="flex items-center gap-1.5">
                <input type="checkbox" checked={scopes.includes(s)} onChange={() => toggle(scopes, s, setScopes)} />
                {SCOPE_LABELS[s]}
              </label>
            ))}
          </div>
          <button type="submit" disabled={!keyName.trim() || scopes.length === 0} className={`${button} self-start`}>
            Create API key
          </button>
        </form>

        <details className="mt-3 text-xs text-gray-600">
          <summary className="cursor-pointer font-medium">How to use a key</summary>
          <pre className="mt-2 overflow-x-auto rounded bg-gray-900 p-3 text-[11px] leading-relaxed text-gray-100">{`# list leads
curl ${API_URL}/v1/leads?limit=25 \\
  -H "Authorization: Bearer YOUR_KEY"

# create a lead (needs the "Create leads" scope)
curl -X POST ${API_URL}/v1/leads \\
  -H "Authorization: Bearer YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"name":"Asha","phone":"919876543210","source":"website"}'`}</pre>
          <p className="mt-1">Lists are paged: pass the returned nextCursor as ?cursor= for the next page. Each key is limited to 120 requests a minute.</p>
        </details>
      </section>

      <section className="mt-6 rounded-md border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-900">Webhooks</h2>
        <p className="mt-1 text-xs text-gray-500">Zenora sends a signed POST to your URL when the events you choose happen. Failed deliveries are retried for about 8 hours.</p>
        {newSecret && <SecretBanner title="Signing secret for the new webhook" value={newSecret.secret} onDismiss={() => setNewSecret(null)} />}

        <ul className="mt-3 divide-y divide-gray-100">
          {hooks.map((h) => (
            <li key={h.id} className="py-2 text-sm">
              <div className="flex items-start justify-between gap-3">
                <div className={h.active ? "" : "opacity-50"}>
                  <p className="break-all font-medium text-gray-900">{h.url}</p>
                  <p className="text-xs text-gray-500">
                    {h.events.join(", ")}
                    {h.description ? ` · ${h.description}` : ""}
                    {!h.active && " · paused"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3 text-xs">
                  <button type="button" onClick={() => testHook(h.id)} className="text-brand-700 underline">
                    Send test
                  </button>
                  <button type="button" onClick={() => setOpenDeliveries(openDeliveries === h.id ? null : h.id)} className="text-gray-600 underline">
                    Deliveries
                  </button>
                  <button type="button" onClick={() => toggleHook(h)} className="text-gray-600 underline">
                    {h.active ? "Pause" : "Resume"}
                  </button>
                  <button type="button" onClick={() => deleteHook(h.id)} className="text-red-600 underline">
                    Delete
                  </button>
                </div>
              </div>
              {openDeliveries === h.id && <Deliveries key={`${h.id}-${message?.text ?? ""}`} workspaceId={workspaceId} webhookId={h.id} />}
            </li>
          ))}
          {hooks.length === 0 && <li className="py-2 text-sm text-gray-400">No webhooks yet.</li>}
        </ul>

        <form onSubmit={createHook} className="mt-3 flex flex-col gap-2 border-t border-gray-100 pt-3">
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/zenora-webhook" required className={input} />
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description (optional)" maxLength={120} className={input} />
          <div className="flex flex-col gap-1 text-xs text-gray-700">
            {WEBHOOK_EVENTS.map((ev) => (
              <label key={ev} className="flex items-center gap-1.5">
                <input type="checkbox" checked={events.includes(ev)} onChange={() => toggle(events, ev, setEvents)} />
                <span className="font-mono">{ev}</span> <span className="text-gray-400">{WEBHOOK_EVENT_LABELS[ev]}</span>
              </label>
            ))}
          </div>
          <button type="submit" disabled={!url.trim() || events.length === 0} className={`${button} self-start`}>
            Add webhook
          </button>
        </form>

        <details className="mt-3 text-xs text-gray-600">
          <summary className="cursor-pointer font-medium">Verifying a delivery</summary>
          <p className="mt-2">
            Each request has an <code>X-Zenora-Signature</code> header like <code>t=1790000000,v1=…</code>. Compute an HMAC-SHA256 of <code>t + &quot;.&quot; + rawBody</code> with your signing secret, compare it to <code>v1</code>, and reject requests whose
            timestamp is more than a few minutes old. Answer with any 2xx status to confirm.
          </p>
          <pre className="mt-2 overflow-x-auto rounded bg-gray-900 p-3 text-[11px] leading-relaxed text-gray-100">{`const [t, v1] = header.split(",").map((p) => p.split("=")[1]);
const expected = crypto.createHmac("sha256", secret)
  .update(t + "." + rawBody).digest("hex");
const ok = crypto.timingSafeEqual(Buffer.from(v1), Buffer.from(expected));`}</pre>
        </details>
      </section>
    </div>
  );
}
