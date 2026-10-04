"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { SlotPicker } from "@/components/slot-picker";
import { apiFetch, type ApiError } from "@/lib/api";

interface Booking {
  typeId: string;
  name: string;
  businessName: string;
  timezone: string;
  durationMin: number;
  startsAt: string;
  status: string;
  canChange: boolean;
  canReschedule: boolean;
}

// A guest's private page for one booking: reached from the link on the
// confirmation screen. The key in the address is the only credential.
export default function ManageBookingPage() {
  const { key } = useParams<{ key: string }>();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [missing, setMissing] = useState(false);
  const [moving, setMoving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const base = `/public/booking-manage/${key}`;
  const load = () => apiFetch<Booking>(base).then(setBooking).catch(() => setMissing(true));
  useEffect(() => {
    load();
  }, [key]);

  const when = (iso: string, tz: string) => `${new Date(iso).toLocaleDateString([], { timeZone: tz, dateStyle: "full" })} at ${new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", timeZone: tz })}`;

  async function cancel() {
    if (!confirm("Cancel this booking?")) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`${base}/cancel`, { method: "POST" });
      setMessage("Your booking has been cancelled.");
      await load();
    } catch (err) {
      setError((err as ApiError).message ?? "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function move(date: string, startsAt: string) {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`${base}/reschedule`, { method: "POST", body: JSON.stringify({ date, startsAt }) });
      setMessage("Your booking has been moved.");
      setMoving(false);
      await load();
    } catch (err) {
      setError((err as ApiError).message ?? "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  if (missing) return <main className="mx-auto max-w-sm p-6 text-center text-sm text-gray-500">This booking link isn&apos;t valid.</main>;
  if (!booking) return <main className="mx-auto max-w-sm p-6 text-center text-sm text-gray-400">Loading…</main>;

  const cancelled = booking.status === "cancelled";

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col gap-4 px-4 py-8">
      <div className="text-center">
        <p className="text-xs uppercase tracking-wide text-gray-400">{booking.businessName}</p>
        <h1 className="text-2xl font-semibold text-gray-900">{booking.name}</h1>
        <p className="mt-1 text-sm text-gray-600">{when(booking.startsAt, booking.timezone)}</p>
        <p className="text-sm text-gray-500">{booking.durationMin} minutes</p>
        {cancelled && <p className="mt-2 inline-block rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-700">Cancelled</p>}
      </div>

      {message && <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">{message}</p>}
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {!cancelled && !booking.canChange && <p className="text-center text-sm text-gray-500">This booking has already taken place, so it can no longer be changed.</p>}

      {booking.canChange && !moving && (
        <div className="flex flex-col gap-2">
          {booking.canReschedule && (
            <button type="button" onClick={() => setMoving(true)} className="rounded-lg bg-brand py-2.5 text-sm font-semibold text-white">
              Choose another time
            </button>
          )}
          <button type="button" disabled={busy} onClick={cancel} className="rounded-lg border border-red-300 py-2.5 text-sm font-semibold text-red-700 disabled:opacity-50">
            Cancel booking
          </button>
        </div>
      )}

      {moving && <SlotPicker slotsPath={`${base}/slots`} timezone={booking.timezone} onPick={move} onCancel={() => setMoving(false)} busy={busy} />}
    </main>
  );
}
