"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

const SECTIONS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/workspaces", label: "Workspaces" },
  { href: "/admin/plans", label: "Plans and pricing" },
  { href: "/admin/templates", label: "Template review" },
  { href: "/admin/referrals", label: "Referral payouts" },
  { href: "/admin/integrations", label: "Integrations" }
];
const COMING_SOON: string[] = [];

// Platform-level area for the Zenora team — separate from any workspace.
// Access is enforced by the API; this only decides what to render.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    apiFetch<{ isSuperAdmin: boolean }>("/admin/me")
      .then((r) => setAllowed(r.isSuperAdmin))
      .catch(() => setAllowed(false));
  }, []);

  if (allowed === null) return <p className="p-6 text-sm text-gray-400">Loading…</p>;
  if (!allowed) {
    return (
      <main className="mx-auto max-w-sm p-8 text-center">
        <h1 className="text-lg font-semibold text-gray-900">Super admin only</h1>
        <p className="mt-2 text-sm text-gray-500">You don&apos;t have access to the platform admin area.</p>
        <Link href="/dashboard" className="mt-4 inline-block text-sm text-brand-700 underline">
          Back to Zenora
        </Link>
      </main>
    );
  }

  return (
    <div className="flex min-h-screen">
      <aside className="w-56 shrink-0 border-r border-gray-200 bg-white p-3">
        <p className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Platform admin</p>
        <nav className="space-y-0.5">
          {SECTIONS.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              className={`block rounded-md px-3 py-2 text-sm font-medium ${pathname === s.href || (s.href !== "/admin" && pathname.startsWith(s.href)) ? "bg-brand-50 text-brand-700" : "text-gray-700 hover:bg-gray-50"}`}
            >
              {s.label}
            </Link>
          ))}
          {COMING_SOON.map((label) => (
            <span key={label} className="flex items-center justify-between rounded-md px-3 py-2 text-sm text-gray-400">
              {label}
              <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">Soon</span>
            </span>
          ))}
        </nav>
        <Link href="/dashboard" className="mt-6 block px-3 text-xs text-gray-500 underline">
          ← Back to Zenora
        </Link>
      </aside>
      <main className="flex-1 bg-gray-50 p-6">{children}</main>
    </div>
  );
}
