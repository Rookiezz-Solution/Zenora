// Appointment slot calculation (docs/PRD.md section 11: appointment types,
// availability, buffers). Pure and timezone-aware so the API, the booking
// page and tests all agree on what "10:00 on 3 Oct" means.

export interface AvailabilityWindow {
  day: number; // 0 = Sunday ... 6 = Saturday, in the schedule's timezone
  start: string; // "HH:MM"
  end: string; // "HH:MM"
}

export interface Interval {
  start: number; // epoch ms
  end: number;
}

export interface SlotInput {
  date: string; // "YYYY-MM-DD" in `timezone`
  timezone: string; // IANA, e.g. "Asia/Kolkata"
  windows: AvailabilityWindow[];
  durationMin: number;
  bufferMin: number;
  busy: Interval[];
  now: number;
  minNoticeMin: number;
}

const MIN = 60_000;

// Offset of `timezone` from UTC at a given instant, in ms (handles DST).
function zoneOffsetMs(utcMs: number, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).formatToParts(new Date(utcMs));
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

// Wall-clock time in `timezone` -> epoch ms. Two passes so a DST change
// between the guess and the answer still lands on the right instant.
export function zonedTimeToUtc(date: string, time: string, timezone: string): number {
  const [y, mo, d] = date.split("-").map(Number) as [number, number, number];
  const [h, mi] = time.split(":").map(Number) as [number, number];
  const naive = Date.UTC(y, mo - 1, d, h, mi);
  const first = naive - zoneOffsetMs(naive, timezone);
  return naive - zoneOffsetMs(first, timezone);
}

export function dayOfWeek(date: string): number {
  const [y, mo, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
}

function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}

// Slot start times (epoch ms) a guest can book on `date`. A slot is offered
// when it fits inside an availability window, starts after the minimum
// notice, and — padded by the buffer on both sides — doesn't touch anything
// busy (existing appointments or the host's Google Calendar).
export function computeSlots(input: SlotInput): number[] {
  const { date, timezone, windows, durationMin, bufferMin, busy, now, minNoticeMin } = input;
  const earliest = now + minNoticeMin * MIN;
  const slots = new Set<number>();

  for (const w of windows.filter((x) => x.day === dayOfWeek(date))) {
    const windowStart = zonedTimeToUtc(date, w.start, timezone);
    const windowEnd = zonedTimeToUtc(date, w.end, timezone);
    for (let t = windowStart; t + durationMin * MIN <= windowEnd; t += durationMin * MIN) {
      if (t < earliest) continue;
      const padded = { start: t - bufferMin * MIN, end: t + (durationMin + bufferMin) * MIN };
      if (busy.some((b) => overlaps(padded, b))) continue;
      slots.add(t);
    }
  }
  return [...slots].sort((a, b) => a - b);
}

// A requested start is only valid if it is one of the slots we'd offer —
// so a guest can't book outside availability by editing the request.
export function isSlotAvailable(startMs: number, input: SlotInput): boolean {
  return computeSlots(input).includes(startMs);
}
