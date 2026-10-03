"use client";

import { useEffect, useState } from "react";
import { apiFetch, type ApiError } from "@/lib/api";
import { useCurrentWorkspace } from "@/lib/use-workspace";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface Appointment {
  id: string;
  startsAt: string;
  guestName: string;
  guestPhone: string;
  appointmentType: { name: string };
}
interface AppointmentType {
  id: string;
  name: string;
  durationMin: number;
  bufferMin: number;
  hostUserId: string;
  availability: { day: number; start: string; end: string }[];
}
interface Member {
  user: { id: string; name: string | null; email: string };
}

export default function CalendarPage() {
  const { workspaceId } = useCurrentWorkspace();
  const [status, setStatus] = useState<{ connected: boolean; email: string | null } | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [types, setTypes] = useState<AppointmentType[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [hostUserId, setHostUserId] = useState("");
  const [durationMin, setDurationMin] = useState(30);
  const [bufferMin, setBufferMin] = useState(0);
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [start, setStart] = useState("10:00");
  const [end, setEnd] = useState("18:00");

  function load() {
    if (!workspaceId) return;
    apiFetch<typeof status>(`/calendar/${workspaceId}/status`).then(setStatus).catch(() => setStatus(null));
    apiFetch<Appointment[]>(`/calendar/${workspaceId}/appointments?days=14`).then(setAppointments).catch(() => setAppointments([]));
    apiFetch<AppointmentType[]>(`/calendar/${workspaceId}/types`).then(setTypes).catch(() => setTypes([]));
  }
  useEffect(load, [workspaceId]);
  useEffect(() => {
    if (!workspaceId) return;
    apiFetch<Member[]>(`/workspaces/${workspaceId}/members`)
      .then((m) => {
        setMembers(m);
        setHostUserId((cur) => cur || m[0]?.user.id || "");
      })
      .catch(() => setMembers([]));
  }, [workspaceId]);

  async function disconnect() {
    await apiFetch(`/calendar/${workspaceId}/connection`, { method: "DELETE" });
    load();
  }

  async function createType(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    try {
      await apiFetch(`/calendar/${workspaceId}/types`, {
        method: "POST",
        body: JSON.stringify({
          name,
          hostUserId,
          durationMin,
          bufferMin,
          availability: days.map((day) => ({ day, start, end }))
        })
      });
      setName("");
      load();
    } catch (err) {
      setMessage((err as ApiError).message ?? "Could not create");
    }
  }

  async function removeType(id: string) {
    await apiFetch(`/calendar/${workspaceId}/types/${id}`, { method: "DELETE" });
    load();
  }

  if (!workspaceId) return <p className="text-sm text-gray-500">Log in and create a workspace first.</p>;

  const byDay = new Map<string, Appointment[]>();
  for (const a of appointments) {
    const key = new Date(a.startsAt).toDateString();
    byDay.set(key, [...(byDay.get(key) ?? []), a]);
  }
  const input = "rounded-md border border-gray-300 px-2 py-1.5 text-sm";

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold text-gray-900">Calendar</h1>
      <p className="mt-1 text-sm text-gray-500">Appointments booked through your booking pages, kept in sync with your Google Calendar.</p>

      <section className="mt-6 rounded-md border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-900">Google Calendar</h2>
        {status?.connected ? (
          <p className="mt-2 text-sm text-gray-700">
            Connected{status.email ? ` as ${status.email}` : ""}. Your busy times block booking slots, and new bookings are added to your calendar.{" "}
            <button type="button" onClick={disconnect} className="text-red-600 underline">
              Disconnect
            </button>
          </p>
        ) : (
          <div className="mt-2 text-sm text-gray-600">
            <p>Sign in with Google to block out your busy times and add bookings to your calendar. Each team member connects their own account.</p>
            <a href={`${API_URL}/calendar/${workspaceId}/connect`} className="mt-2 inline-block rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-white">
              Connect Google Calendar
            </a>
          </div>
        )}
      </section>

      <section className="mt-4 rounded-md border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-900">Next 14 days</h2>
        {byDay.size === 0 && <p className="mt-2 text-sm text-gray-400">No appointments yet.</p>}
        {[...byDay.entries()].map(([day, items]) => (
          <div key={day} className="mt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{day}</p>
            <ul className="mt-1 divide-y divide-gray-100">
              {items.map((a) => (
                <li key={a.id} className="flex justify-between py-1.5 text-sm">
                  <span>
                    {new Date(a.startsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · {a.appointmentType.name}
                  </span>
                  <span className="text-gray-500">
                    {a.guestName} · {a.guestPhone}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <section className="mt-4 rounded-md border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-900">Appointment types</h2>
        <ul className="mt-2 divide-y divide-gray-100">
          {types.map((t) => (
            <li key={t.id} className="flex items-center justify-between py-2 text-sm">
              <span>
                {t.name} <span className="text-xs text-gray-400">· {t.durationMin} min</span>
                <br />
                <a href={`/book/${t.id}`} target="_blank" rel="noreferrer" className="text-xs text-brand-700 underline">
                  /book/{t.id}
                </a>
              </span>
              <button type="button" onClick={() => removeType(t.id)} className="text-xs text-red-600">
                Delete
              </button>
            </li>
          ))}
          {types.length === 0 && <li className="py-2 text-sm text-gray-400">No appointment types yet.</li>}
        </ul>

        <form onSubmit={createType} className="mt-3 flex flex-col gap-2 border-t border-gray-100 pt-3">
          <div className="flex flex-wrap gap-2">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name, e.g. Consultation" required className={`${input} flex-1`} />
            <select value={hostUserId} onChange={(e) => setHostUserId(e.target.value)} className={input}>
              {members.map((m) => (
                <option key={m.user.id} value={m.user.id}>
                  {m.user.name ?? m.user.email}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
            <label>
              Duration{" "}
              <input type="number" min={5} value={durationMin} onChange={(e) => setDurationMin(Number(e.target.value))} className={`${input} w-20`} /> min
            </label>
            <label>
              Buffer{" "}
              <input type="number" min={0} value={bufferMin} onChange={(e) => setBufferMin(Number(e.target.value))} className={`${input} w-20`} /> min
            </label>
            <label>
              From <input type="time" value={start} onChange={(e) => setStart(e.target.value)} className={input} />
            </label>
            <label>
              To <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className={input} />
            </label>
          </div>
          <div className="flex flex-wrap gap-1">
            {DAYS.map((label, day) => (
              <button
                key={label}
                type="button"
                onClick={() => setDays((d) => (d.includes(day) ? d.filter((x) => x !== day) : [...d, day]))}
                className={`rounded-full px-3 py-1 text-xs font-medium ${days.includes(day) ? "bg-brand text-white" : "bg-gray-100 text-gray-600"}`}
              >
                {label}
              </button>
            ))}
          </div>
          {message && <p className="text-xs text-red-600">{message}</p>}
          <button type="submit" disabled={days.length === 0} className="self-start rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
            Add appointment type
          </button>
        </form>
      </section>
    </div>
  );
}
