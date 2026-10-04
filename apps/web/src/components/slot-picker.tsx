"use client";

import { useEffect, useState } from "react";
import { apiFetch, type ApiError } from "@/lib/api";

function dateOffset(days: number): string {
  const d = new Date(Date.now() + days * 86_400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Choose a new date and time for an existing booking. `slotsPath` is the API
// path that lists free times for a given date; the caller confirms the choice.
export function SlotPicker({ slotsPath, timezone, onPick, onCancel, busy }: { slotsPath: string; timezone?: string; onPick: (date: string, startsAt: string) => void; onCancel: () => void; busy?: boolean }) {
  const [date, setDate] = useState(dateOffset(1));
  const [slots, setSlots] = useState<number[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<number | null>(null);

  useEffect(() => {
    setSlots(null);
    setPicked(null);
    setError(null);
    apiFetch<{ slots: number[] }>(`${slotsPath}${slotsPath.includes("?") ? "&" : "?"}date=${date}`)
      .then((r) => setSlots(r.slots))
      .catch((err) => {
        setSlots([]);
        setError((err as ApiError).message ?? "Could not load times");
      });
  }, [slotsPath, date]);

  const fmt = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", timeZone: timezone });

  return (
    <div className="flex flex-col gap-3 rounded-md border border-gray-200 bg-gray-50 p-3">
      <label className="flex flex-col gap-1 text-sm text-gray-700">
        New date
        <input type="date" value={date} min={dateOffset(0)} max={dateOffset(60)} onChange={(e) => setDate(e.target.value)} className="rounded-md border border-gray-300 px-3 py-2" />
      </label>
      <div className="flex flex-wrap gap-2">
        {slots === null && <p className="text-sm text-gray-400">Loading times…</p>}
        {slots?.length === 0 && <p className="text-sm text-gray-500">{error ?? "No times available on this day."}</p>}
        {slots?.map((s) => (
          <button key={s} type="button" onClick={() => setPicked(s)} className={`rounded-lg border px-3 py-2 text-sm font-medium ${picked === s ? "border-brand bg-brand text-white" : "border-gray-300 text-gray-800"}`}>
            {fmt(s)}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <button type="button" disabled={picked === null || busy} onClick={() => picked !== null && onPick(date, new Date(picked).toISOString())} className="rounded-md bg-brand px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">
          {busy ? "Saving…" : "Move booking"}
        </button>
        <button type="button" onClick={onCancel} className="rounded-md px-3 py-1.5 text-sm text-gray-600 underline">
          Keep current time
        </button>
      </div>
    </div>
  );
}
