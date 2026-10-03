"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch, type ApiError } from "@/lib/api";

interface PublicType {
  name: string;
  durationMin: number;
  businessName: string;
  timezone: string;
  consentText: string;
}

function dateOffset(days: number): string {
  const d = new Date(Date.now() + days * 86_400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Public, unauthenticated booking page a business shares with guests.
export default function BookingPage() {
  const { typeId } = useParams<{ typeId: string }>();
  const [type, setType] = useState<PublicType | null>(null);
  const [missing, setMissing] = useState(false);
  const [date, setDate] = useState(dateOffset(1));
  const [slots, setSlots] = useState<number[] | null>(null);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<PublicType>(`/public/booking/${typeId}`).then(setType).catch(() => setMissing(true));
  }, [typeId]);

  useEffect(() => {
    setSlots(null);
    setPicked(null);
    setSlotsError(null);
    apiFetch<{ slots: number[] }>(`/public/booking/${typeId}/slots?date=${date}`)
      .then((r) => setSlots(r.slots))
      .catch((err) => {
        setSlots([]);
        setSlotsError((err as ApiError).message ?? "Could not load times");
      });
  }, [typeId, date]);

  const fmt = (ms: number) =>
    new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", timeZone: type?.timezone });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (picked === null) return;
    setStatus("sending");
    setError(null);
    try {
      await apiFetch(`/public/booking/${typeId}/book`, {
        method: "POST",
        body: JSON.stringify({ date, startsAt: new Date(picked).toISOString(), name, phone, consent })
      });
      setStatus("done");
    } catch (err) {
      setError((err as ApiError).message ?? "Something went wrong");
      setStatus("idle");
    }
  }

  if (missing) return <main className="mx-auto max-w-sm p-6 text-center text-sm text-gray-500">This booking page isn&apos;t available.</main>;
  if (!type) return <main className="mx-auto max-w-sm p-6 text-center text-sm text-gray-400">Loading…</main>;

  if (status === "done") {
    return (
      <main className="mx-auto max-w-sm p-6 text-center">
        <h1 className="text-xl font-semibold text-gray-900">You&apos;re booked</h1>
        <p className="mt-2 text-sm text-gray-600">
          {type.name} with {type.businessName} on {new Date(picked!).toLocaleDateString([], { timeZone: type.timezone })} at {fmt(picked!)}. We&apos;ll be in touch to confirm.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col gap-4 px-4 py-8">
      <div className="text-center">
        <p className="text-xs uppercase tracking-wide text-gray-400">{type.businessName}</p>
        <h1 className="text-2xl font-semibold text-gray-900">{type.name}</h1>
        <p className="text-sm text-gray-500">{type.durationMin} minutes</p>
      </div>

      <label className="flex flex-col gap-1 text-sm text-gray-700">
        Choose a date
        <input type="date" value={date} min={dateOffset(0)} max={dateOffset(60)} onChange={(e) => setDate(e.target.value)} className="rounded-md border border-gray-300 px-3 py-2" />
      </label>

      <div className="flex flex-wrap gap-2">
        {slots === null && <p className="text-sm text-gray-400">Loading times…</p>}
        {slots?.length === 0 && <p className="text-sm text-gray-500">{slotsError ?? "No times available on this day."}</p>}
        {slots?.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setPicked(s)}
            className={`rounded-lg border px-3 py-2 text-sm font-medium ${picked === s ? "border-brand bg-brand text-white" : "border-gray-300 text-gray-800"}`}
          >
            {fmt(s)}
          </button>
        ))}
      </div>

      {picked !== null && (
        <form onSubmit={submit} className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" required maxLength={100} className="rounded-md border border-gray-300 px-3 py-2 text-sm" />
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone number" required inputMode="tel" className="rounded-md border border-gray-300 px-3 py-2 text-sm" />
          <label className="flex items-start gap-2 text-xs text-gray-600">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5" />
            {type.consentText}
          </label>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <button type="submit" disabled={!consent || status === "sending"} className="rounded-lg bg-brand py-2.5 text-sm font-semibold text-white disabled:opacity-50">
            {status === "sending" ? "Booking…" : `Book ${fmt(picked)}`}
          </button>
        </form>
      )}
    </main>
  );
}
