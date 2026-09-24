"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Nav order matches design/screens (Dashboard.dc.html / workspace shell) and
// docs/PRD.md section 3. Icons come later with the shadcn/ui pass — labels
// and structure are what Phase 0's app shell needs to match.
const NAV_ITEMS = [
  { href: "/dashboard", label: "Home" },
  { href: "/inbox", label: "Inbox" },
  { href: "/leads", label: "Leads" },
  { href: "/pipeline", label: "Leads board" },
  { href: "/automations", label: "Automations" },
  { href: "/calendar", label: "Calendar" },
  { href: "/calls", label: "Calls" },
  { href: "/meetings", label: "Meetings" },
  { href: "/tasks", label: "Tasks and follow-ups" },
  { href: "/broadcasts", label: "Broadcasts and templates" },
  { href: "/knowledge", label: "AI knowledge" },
  { href: "/sources", label: "Ads and sources" },
  { href: "/link-in-bio", label: "Link in bio" },
  { href: "/reports", label: "Reports" },
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
  return (
    <button
      type="button"
      className="flex items-center gap-2 border-b border-gray-200 px-4 py-3 text-left hover:bg-gray-50"
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-md bg-brand text-sm font-semibold text-white">
        Z
      </span>
      <span className="flex-1 truncate text-sm font-semibold text-gray-900">Workspace</span>
      <span aria-hidden className="text-gray-400">
        ⌄
      </span>
    </button>
  );
}

function SearchTrigger() {
  return (
    <button
      type="button"
      className="mx-3 mt-3 flex items-center justify-between rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-500 hover:border-gray-300"
    >
      <span>Search leads, chats, automations</span>
      <kbd className="rounded border border-gray-300 bg-gray-50 px-1.5 py-0.5 text-xs">Ctrl K</kbd>
    </button>
  );
}

function AiCreditsMeter() {
  // Phase 0 placeholder — wired to real usage once the credit ledger (Phase 2)
  // ships. Layout matches design/screens so the header doesn't reflow later.
  return (
    <div className="mx-3 mt-3 rounded-md bg-gray-50 px-3 py-2 text-xs text-gray-600">
      AI credits <span className="font-semibold text-gray-900">— / —</span>
    </div>
  );
}

function FooterLinks() {
  return (
    <div className="border-t border-gray-200 px-2 py-2 text-sm">
      <Link href="/notifications" className="block rounded-md px-3 py-2 text-gray-700 hover:bg-gray-50">
        Notifications
      </Link>
      <Link href="/help" className="block rounded-md px-3 py-2 text-gray-700 hover:bg-gray-50">
        Help and support
      </Link>
      <Link href="/profile" className="mt-1 flex items-center gap-2 rounded-md px-3 py-2 hover:bg-gray-50">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
          U
        </span>
        <span className="flex flex-col">
          <span className="text-sm font-medium text-gray-900">Your name</span>
          <span className="text-xs text-gray-500">Free plan</span>
        </span>
      </Link>
    </div>
  );
}
