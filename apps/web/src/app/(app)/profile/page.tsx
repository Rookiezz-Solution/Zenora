"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch, type ApiError } from "@/lib/api";

interface Me {
  email: string;
  name: string | null;
  phone: string | null;
}

export default function ProfilePage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<Me>("/auth/me").then(setMe).catch(() => setMe(null));
  }, []);

  async function signOut(everywhere: boolean) {
    if (everywhere && !confirm("Sign out of Zenora on every device, including this one?")) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(everywhere ? "/auth/logout-all" : "/auth/logout", { method: "POST" });
      router.push("/login");
    } catch (err) {
      setError((err as ApiError).message ?? "Could not sign out. Try again.");
      setBusy(false);
    }
  }

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-semibold text-gray-900">Your profile</h1>

      <section className="mt-6 rounded-md border border-gray-200 bg-white p-4">
        {!me ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : (
          <dl className="grid grid-cols-[7rem_1fr] gap-y-2 text-sm">
            <dt className="text-gray-500">Name</dt>
            <dd className="text-gray-900">{me.name || "Not set"}</dd>
            <dt className="text-gray-500">Email</dt>
            <dd className="text-gray-900">{me.email}</dd>
            {me.phone && (
              <>
                <dt className="text-gray-500">Phone</dt>
                <dd className="text-gray-900">{me.phone}</dd>
              </>
            )}
          </dl>
        )}
      </section>

      <section className="mt-4 rounded-md border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-900">Sign out</h2>
        {error && <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={() => signOut(false)} className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            Sign out
          </button>
          <button type="button" disabled={busy} onClick={() => signOut(true)} className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 disabled:opacity-50">
            Sign out of all devices
          </button>
        </div>
        <p className="mt-2 text-xs text-gray-500">Use &ldquo;all devices&rdquo; if you lost a phone or used a shared computer.</p>
      </section>

      <p className="mt-6 text-sm text-gray-600">
        To download your data or delete your workspace or account, go to{" "}
        <Link href="/settings/privacy" className="font-medium text-brand-700 underline">
          Settings → Privacy
        </Link>
        .
      </p>
    </div>
  );
}
