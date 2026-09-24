import Link from "next/link";

// Placeholder root page. The full Landing.dc.html marketing page is built in
// Phase 1 alongside sign-up; Phase 0 just needs a working entry point into
// the auth flow.
export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand text-xl font-semibold text-white">
        Z
      </span>
      <h1 className="text-3xl font-semibold text-gray-900">Zenora</h1>
      <p className="max-w-md text-gray-500">Turn every comment and DM into a closed deal.</p>
      <div className="flex gap-3">
        <Link href="/signup" className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white">
          Start free
        </Link>
        <Link href="/login" className="rounded-md border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700">
          Log in
        </Link>
      </div>
    </main>
  );
}
