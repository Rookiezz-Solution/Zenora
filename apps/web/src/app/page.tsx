import Link from "next/link";

const FEATURES: { title: string; body: string }[] = [
  { title: "One inbox for Instagram and WhatsApp", body: "Every comment, DM and chat in one place, with the 24-hour rule handled for you." },
  { title: "Automations that qualify leads", body: "Ready-made flows for clinics, salons, coaching, real estate and more, with a human handover whenever it matters." },
  { title: "A pipeline that tells you what is next", body: "Stages, tasks, reply timers and routing so no enquiry is left waiting." },
  { title: "Bookings and reminders", body: "A booking page that follows your calendar, with WhatsApp reminders before the appointment." },
  { title: "Know what your ads bring in", body: "See cost per lead, booking and sale for each Meta campaign." },
  { title: "Yours to take with you", body: "Download everything, connect your own tools with an API, delete it all whenever you choose." }
];

export default function HomePage() {
  return (
    <main className="mx-auto max-w-5xl px-5 py-16">
      <div className="flex flex-col items-center text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand text-xl font-semibold text-white">Z</span>
        <h1 className="mt-4 text-4xl font-semibold text-gray-900">Turn every comment and DM into a closed deal.</h1>
        <p className="mt-3 max-w-xl text-gray-500">Zenora is the CRM for businesses that sell through Instagram and WhatsApp. Reply fast, never lose a lead, and see what works.</p>
        <div className="mt-6 flex gap-3">
          <Link href="/signup" className="rounded-md bg-brand px-5 py-2.5 text-sm font-semibold text-white">
            Start free
          </Link>
          <Link href="/pricing" className="rounded-md border border-gray-300 px-5 py-2.5 text-sm font-semibold text-gray-700">
            See pricing
          </Link>
          <Link href="/login" className="rounded-md px-3 py-2.5 text-sm font-semibold text-gray-600 underline">
            Log in
          </Link>
        </div>
      </div>

      <div className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f) => (
          <div key={f.title} className="rounded-lg border border-gray-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-gray-900">{f.title}</h2>
            <p className="mt-1 text-sm text-gray-500">{f.body}</p>
          </div>
        ))}
      </div>

      <footer className="mt-16 flex justify-center gap-4 border-t border-gray-200 pt-6 text-xs text-gray-500">
        <Link href="/pricing" className="underline">
          Pricing
        </Link>
        <Link href="/terms" className="underline">
          Terms of service
        </Link>
        <Link href="/privacy" className="underline">
          Privacy policy
        </Link>
      </footer>
    </main>
  );
}
