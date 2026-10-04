"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { UsageOverview } from "@/lib/billing-types";
import { SearchTrigger } from "@/components/search-palette";
import { PLAN_LABELS } from "@zenora/shared";
import { switchWorkspace, useCurrentWorkspace } from "@/lib/use-workspace";

// The credit meter and the profile footer both need the usage figures, so one
// request is shared between them rather than made twice on every page.
const usageCache = new Map<string, { at: number; promise: Promise<UsageOverview> }>();
function fetchUsage(workspaceId: string): Promise<UsageOverview> {
  const hit = usageCache.get(workspaceId);
  if (hit && Date.now() - hit.at < 5_000) return hit.promise;
  const promise = apiFetch<UsageOverview>(`/billing/${workspaceId}/usage`);
  usageCache.set(workspaceId, { at: Date.now(), promise });
  promise.catch(() => usageCache.delete(workspaceId));
  return promise;
}

// Nav order matches design/screens (Dashboard.dc.html / workspace shell) and
// docs/PRD.md section 3. Icons come later with the shadcn/ui pass — labels
// and structure are what Phase 0's app shell needs to match.
const NAV_ITEMS: { href: string; label: string; soon?: boolean }[] = [
  { href: "/dashboard", label: "Home" },
  { href: "/inbox", label: "Inbox" },
  { href: "/leads", label: "Leads" },
  { href: "/pipeline", label: "Leads board" },
  { href: "/automations", label: "Automations" },
  { href: "/calendar", label: "Calendar" },
  { href: "/calls", label: "Calls", soon: true },
  { href: "/meetings", label: "Meetings", soon: true },
  { href: "/tasks", label: "Tasks and follow-ups" },
  { href: "/broadcasts", label: "Broadcasts and templates" },
  { href: "/settings/knowledge", label: "AI knowledge" },
  { href: "/sources", label: "Ads and sources" },
  { href: "/settings/link-in-bio", label: "Link in bio" },
  { href: "/reports", label: "Reports" },
  { href: "/referrals", label: "Refer and earn" },
  { href: "/settings", label: "Settings" }
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col border-r border-gray-200 bg-white">
      <WorkspaceSwitcher />
      <SearchTrigger />
      <AiCreditsMeter />

      <nav className="flex-1 overflow-y-auto px-2 py-2">
        <ul className="space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href || pathname?.startsWith(`${item.href}/`);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`block rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    active ? "bg-brand-50 text-brand-700" : "text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  {item.label}
                  {item.soon && <span className="ml-2 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">Soon</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <FooterLinks />
    </aside>
  );
}

function WorkspaceSwitcher() {
  const { workspaceId, workspaces } = useCurrentWorkspace();
  const [open, setOpen] = useState(false);
  const current = workspaces.find((w) => w.id === workspaceId);

  return (
    <div className="relative border-b border-gray-200">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-gray-50">
        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-brand text-sm font-semibold text-white">{(current?.name ?? "Z").slice(0, 1).toUpperCase()}</span>
        <span className="flex-1 truncate text-sm font-semibold text-gray-900">{current?.name ?? "Workspace"}</span>
        <span aria-hidden className="text-gray-400">
          ⌄
        </span>
      </button>
      {open && (
        <div className="absolute left-2 right-2 top-full z-20 mt-1 rounded-md border border-gray-200 bg-white py-1 shadow-lg">
          {workspaces.map((w) => (
            <button
              key={w.id}
              type="button"
              onClick={() => switchWorkspace(w.id)}
              className={`block w-full truncate px-3 py-2 text-left text-sm hover:bg-gray-50 ${w.id === workspaceId ? "font-semibold text-brand-700" : "text-gray-700"}`}
            >
              {w.name}
            </button>
          ))}
          <Link href="/agency" onClick={() => setOpen(false)} className="block border-t border-gray-100 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50">
            Agency and clients
          </Link>
        </div>
      )}
    </div>
  );
}


function AiCreditsMeter() {
  const { workspaceId } = useCurrentWorkspace();
  const [usage, setUsage] = useState<UsageOverview | null>(null);

  useEffect(() => {
    if (!workspaceId) return;
    fetchUsage(workspaceId).then(setUsage).catch(() => setUsage(null));
  }, [workspaceId]);

  const used = usage ? usage.limits.aiCreditsPerMonth - usage.usage.aiCreditsRemaining : null;
  return (
    <div className="mx-3 mt-3 rounded-md bg-gray-50 px-3 py-2 text-xs text-gray-600">
      AI credits{" "}
      <span className="font-semibold text-gray-900">{usage ? `${used} / ${usage.limits.aiCreditsPerMonth}` : "— / —"}</span>
    </div>
  );
}

function FooterLinks() {
  const { workspaceId } = useCurrentWorkspace();
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [me, setMe] = useState<{ name: string | null; email: string } | null>(null);
  const [planLabel, setPlanLabel] = useState<string | null>(null);
  useEffect(() => {
    apiFetch<{ isSuperAdmin: boolean }>("/admin/me").then((r) => setIsSuperAdmin(r.isSuperAdmin)).catch(() => setIsSuperAdmin(false));
    apiFetch<{ name: string | null; email: string }>("/auth/me").then(setMe).catch(() => setMe(null));
  }, []);
  useEffect(() => {
    if (!workspaceId) return;
    fetchUsage(workspaceId).then((u) => setPlanLabel(`${PLAN_LABELS[u.planId]} plan`)).catch(() => setPlanLabel(null));
  }, [workspaceId]);
  const displayName = me?.name?.trim() || me?.email || "Your profile";

  return (
    <div className="border-t border-gray-200 px-2 py-2 text-sm">
      <Link href="/notifications" className="block rounded-md px-3 py-2 text-gray-700 hover:bg-gray-50">
        Notifications
      </Link>
      {isSuperAdmin && (
        <Link href="/admin" className="block rounded-md px-3 py-2 text-gray-700 hover:bg-gray-50">
          Platform admin
        </Link>
      )}
      <Link href="/help" className="block rounded-md px-3 py-2 text-gray-700 hover:bg-gray-50">
        Help and support
      </Link>
      <Link href="/profile" className="mt-1 flex items-center gap-2 rounded-md px-3 py-2 hover:bg-gray-50">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
          {displayName.charAt(0).toUpperCase()}
        </span>
        <span className="flex flex-col">
          <span className="max-w-[10rem] truncate text-sm font-medium text-gray-900">{displayName}</span>
          {planLabel && <span className="text-xs text-gray-500">{planLabel}</span>}
        </span>
      </Link>
    </div>
  );
}
