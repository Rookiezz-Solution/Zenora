"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/settings", label: "Channels" },
  { href: "/settings/fields", label: "Custom fields" },
  { href: "/settings/routing", label: "Routing" },
  { href: "/settings/labels", label: "Industry and labels" }
];

export function SettingsTabs() {
  const pathname = usePathname();
  return (
    <div className="mb-6 flex gap-1 border-b border-gray-200">
      {TABS.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={`px-3 py-2 text-sm font-medium ${
            pathname === tab.href ? "border-b-2 border-brand text-brand-700" : "text-gray-500 hover:text-gray-700"
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
