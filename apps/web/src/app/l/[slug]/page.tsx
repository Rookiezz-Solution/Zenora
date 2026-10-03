"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch, type ApiError } from "@/lib/api";

interface PublicPage {
  title: string;
  bio: string | null;
  whatsappPhone: string | null;
  brochureUrl: string | null;
  consentText: string;
}

// Public, unauthenticated page a business links from its Instagram bio.
export default function PublicLinkInBioPage() {
  const { slug } = useParams<{ slug: string }>();
  const [page, setPage] = useState<PublicPage | null>(null);
  const [missing, setMissing] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<PublicPage>(`/public/link-in-bio/${slug}`).then(setPage).catch(() => setMissing(true));
  }, [slug]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setError(null);
    try {
      await apiFetch(`/public/link-in-bio/${slug}/callback`, { method: "POST", body: JSON.stringify({ name, phone, consent }) });
      setStatus("done");
    } catch (err) {
      setError((err as ApiError).message ?? "Something went wrong");
      setStatus("idle");
    }
  }

  if (missing) return <main className="mx-auto max-w-sm p-6 text-center text-sm text-gray-500">This page isn&apos;t available.</main>;
  if (!page) return <main className="mx-auto max-w-sm p-6 text-center text-sm text-gray-400">Loading…</main>;

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col gap-4 px-4 py-8">
      <h1 className="text-center text-2xl font-semibold text-gray-900">{page.title}</h1>
      {page.bio && <p className="text-center text-sm text-gray-600">{page.bio}</p>}

      {page.whatsappPhone && (
        <a href={`https://wa.me/${page.whatsappPhone}`} className="rounded-lg bg-green-600 py-3 text-center text-sm font-semibold text-white">
          Chat on WhatsApp
        </a>
      )}
      {page.brochureUrl && (
        <a href={page.brochureUrl} target="_blank" rel="noreferrer" className="rounded-lg border border-gray-300 py-3 text-center text-sm font-semibold text-gray-800">
          Download brochure
        </a>
      )}

      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-900">Request a call back</h2>
        {status === "done" ? (
          <p className="mt-3 text-sm text-green-700">Thanks — we&apos;ll be in touch soon.</p>
        ) : (
          <form onSubmit={submit} className="mt-3 flex flex-col gap-3">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" required maxLength={100} className="rounded-md border border-gray-300 px-3 py-2 text-sm" />
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone number" required inputMode="tel" className="rounded-md border border-gray-300 px-3 py-2 text-sm" />
            <label className="flex items-start gap-2 text-xs text-gray-600">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5" />
              {page.consentText}
            </label>
            {error && <p className="text-xs text-red-600">{error}</p>}
            <button type="submit" disabled={!consent || status === "sending"} className="rounded-lg bg-brand py-2.5 text-sm font-semibold text-white disabled:opacity-50">
              {status === "sending" ? "Sending…" : "Request call back"}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
