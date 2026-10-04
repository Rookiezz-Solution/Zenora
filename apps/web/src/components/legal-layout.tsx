import Link from "next/link";

// The legal text in this app is a working draft written for the product as
// built. It has NOT been reviewed by a lawyer. Flip this to false only after it
// has been, so the notice disappears from both pages together.
export const LEGAL_REVIEW_PENDING = true;

export const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "";
export const LEGAL_ENTITY = "Rookiezz Solutions";
export const LEGAL_UPDATED = "4 October 2026";

export function LegalLayout({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <Link href="/" className="text-sm text-brand-700">
        ← Zenora
      </Link>
      <h1 className="mt-4 text-3xl font-semibold text-gray-900">{title}</h1>
      <p className="mt-1 text-xs text-gray-400">Last updated {LEGAL_UPDATED}</p>
      {LEGAL_REVIEW_PENDING && (
        <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Draft: this page describes how Zenora works today, but it has not yet been reviewed by a lawyer and may change before launch.
        </p>
      )}
      <div className="legal mt-6 space-y-4 text-sm leading-relaxed text-gray-700 [&_h2]:mt-8 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-gray-900 [&_li]:ml-5 [&_li]:list-disc">{children}</div>
      <footer className="mt-12 flex gap-4 border-t border-gray-200 pt-4 text-xs text-gray-500">
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
