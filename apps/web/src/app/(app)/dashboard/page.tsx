"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatDuration, planNotice } from "@zenora/shared";
import { apiFetch } from "@/lib/api";
import { sourceLabel } from "@/lib/ads-types";
import { useCurrentWorkspace } from "@/lib/use-workspace";

interface Summary {
  days: number;
  newLeads: { current: number; previous: number; changePct: number | null };
  won: number;
  speedToLeadMinutes: number | null;
  waitingForReply: number;
  tasks: { open: number; overdue: number; dueToday: number };
  appointments: { next7Days: number; upcoming: { id: string; startsAt: string; guestName: string; appointmentType: { name: string } }[] };
  sources: { source: string; leads: number }[];
  pipeline: { id: string; name: string; type: string; leads: number }[];
  whatsappSpendInr: number;
  broadcastsSent: number;
  aiCredits: { remaining: number; monthly: number; plan: { id: string; status: string; trialEndsAt: string | null; currentPeriodEnd: string | null } };
}

function Tile({ label, value, hint, href, tone }: { label: string; value: string; hint?: string; href?: string; tone?: "warn" | "good" }) {
  const body = (
    <div className={`h-full rounded-md border bg-white p-4 ${tone === "warn" ? "border-amber-300" : "border-gray-200"} ${href ? "hover:border-gray-300" : ""}`}>
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${tone === "warn" ? "text-amber-700" : "text-gray-900"}`}>{value}</p>
      {hint && <p className={`mt-1 text-xs ${tone === "good" ? "text-green-700" : "text-gray-400"}`}>{hint}</p>}
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export default function DashboardPage() {
  const { workspaceId, loading } = useCurrentWorkspace();
  const [days, setDays] = useState<7 | 30>(7);
  const [data, setData] = useState<Summary | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!workspaceId) return;
    setFailed(false);
    apiFetch<Summary>(`/dashboard/${workspaceId}?days=${days}`).then(setData).catch(() => setFailed(true));
  }, [workspaceId, days]);

  if (!loading && !workspaceId) {
    return (
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Welcome to Zenora</h1>
        <p className="mt-2 text-sm text-gray-500">Set up your workspace to get started.</p>
        <Link href="/onboarding" className="mt-4 inline-block rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white">
          Start setup
        </Link>
      </div>
    );
  }

  const maxStage = Math.max(1, ...(data?.pipeline.map((s) => s.leads) ?? [0]));
  const totalSources = Math.max(1, data?.sources.reduce((n, s) => n + s.leads, 0) ?? 0);
  const change = data?.newLeads.changePct;
  const notice = data ? planNotice(data.aiCredits.plan) : null;

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Home</h1>
        <div className="flex gap-1">
          {([7, 30] as const).map((d) => (
            <button key={d} type="button" onClick={() => setDays(d)} className={`rounded-full px-3 py-1 text-xs font-medium ${days === d ? "bg-brand text-white" : "bg-gray-100 text-gray-600"}`}>
              Last {d} days
            </button>
          ))}
        </div>
      </div>
      {notice && (
        <div className={`mt-3 flex items-center justify-between rounded-md border px-3 py-2 text-sm ${notice.tone === "warning" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-brand-200 bg-brand-50 text-brand-700"}`}>
          <span>{notice.text}</span>
          <Link href="/settings/billing" className="font-medium underline">
            Choose a plan
          </Link>
        </div>
      )}

      {failed && <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">Could not load your dashboard. Try refreshing.</p>}
      {!data && !failed && <p className="mt-4 text-sm text-gray-400">Loading…</p>}

      {data && (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile
              label={`New leads, last ${data.days} days`}
              value={String(data.newLeads.current)}
              hint={change === null || change === undefined ? `${data.newLeads.previous} the period before` : `${change >= 0 ? "▲" : "▼"} ${Math.abs(change)}% vs the period before`}
              tone={change !== null && change !== undefined && change > 0 ? "good" : undefined}
              href="/leads"
            />
            <Tile label="Won" value={String(data.won)} hint={`in the last ${data.days} days`} href="/pipeline" />
            <Tile label="Speed to first reply" value={formatDuration(data.speedToLeadMinutes)} hint="median, new enquiries" href="/reports" />
            <Tile label="Waiting for a reply" value={String(data.waitingForReply)} hint="customer spoke last" tone={data.waitingForReply > 0 ? "warn" : undefined} href="/inbox" />
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile label="Tasks due today" value={String(data.tasks.dueToday)} hint={`${data.tasks.open} open`} href="/tasks" />
            <Tile label="Overdue tasks" value={String(data.tasks.overdue)} tone={data.tasks.overdue > 0 ? "warn" : undefined} href="/tasks" />
            <Tile label="Bookings, next 7 days" value={String(data.appointments.next7Days)} href="/calendar" />
            <Tile label="WhatsApp broadcast spend" value={`₹${data.whatsappSpendInr.toLocaleString("en-IN")}`} hint={`estimate, ${data.broadcastsSent} sent. Billed to you by Meta`} href="/broadcasts" />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <section className="rounded-md border border-gray-200 bg-white p-4">
              <h2 className="text-sm font-semibold text-gray-900">Pipeline right now</h2>
              {data.pipeline.length === 0 ? (
                <p className="mt-2 text-sm text-gray-400">No pipeline yet.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {data.pipeline.map((s) => (
                    <li key={s.id} className="text-sm">
                      <div className="flex justify-between text-gray-700">
                        <span>{s.name}</span>
                        <span>{s.leads}</span>
                      </div>
                      <div className="mt-1 h-2 rounded bg-gray-100">
                        <div className={`h-2 rounded ${s.type === "won" ? "bg-green-500" : s.type === "lost" ? "bg-red-400" : "bg-brand"}`} style={{ width: `${Math.round((s.leads / maxStage) * 100)}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-md border border-gray-200 bg-white p-4">
              <h2 className="text-sm font-semibold text-gray-900">Where new leads came from</h2>
              {data.sources.length === 0 ? (
                <p className="mt-2 text-sm text-gray-400">No new leads in this period.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {data.sources.map((s) => (
                    <li key={s.source} className="text-sm">
                      <div className="flex justify-between text-gray-700">
                        <span>{sourceLabel(s.source)}</span>
                        <span>{s.leads}</span>
                      </div>
                      <div className="mt-1 h-2 rounded bg-gray-100">
                        <div className="h-2 rounded bg-brand" style={{ width: `${Math.round((s.leads / totalSources) * 100)}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-md border border-gray-200 bg-white p-4">
              <h2 className="text-sm font-semibold text-gray-900">Coming up</h2>
              {data.appointments.upcoming.length === 0 ? (
                <p className="mt-2 text-sm text-gray-400">No bookings in the next 7 days.</p>
              ) : (
                <ul className="mt-2 divide-y divide-gray-100 text-sm">
                  {data.appointments.upcoming.map((a) => (
                    <li key={a.id} className="flex justify-between py-1.5">
                      <span>
                        {a.guestName} <span className="text-xs text-gray-400">{a.appointmentType.name}</span>
                      </span>
                      <span className="text-gray-500">{new Date(a.startsAt).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" })}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-md border border-gray-200 bg-white p-4">
              <h2 className="text-sm font-semibold text-gray-900">AI credits</h2>
              <p className="mt-2 text-2xl font-semibold text-gray-900">
                {data.aiCredits.remaining.toLocaleString("en-IN")} <span className="text-sm font-normal text-gray-400">left of {data.aiCredits.monthly.toLocaleString("en-IN")} / month</span>
              </p>
              <Link href="/settings/billing#ai-credit-topup" className="mt-2 inline-block text-xs text-brand-700 underline">
                Top up
              </Link>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
