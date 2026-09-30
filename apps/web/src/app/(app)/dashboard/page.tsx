"use client";

import Link from "next/link";
import { useCurrentWorkspace } from "@/lib/use-workspace";

export default function DashboardPage() {
  const { workspaceId, loading } = useCurrentWorkspace();

  if (!loading && !workspaceId) {
    return (
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Welcome to Zenora</h1>
        <p className="mt-2 text-sm text-gray-500">Set up your workspace to get started.</p>
        <Link href="/onboarding" className="mt-4 inline-block rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white">
          Start setup
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900">Home</h1>
      <p className="mt-2 text-sm text-gray-500">
        Dashboard widgets (new leads, qualified, speed-to-lead, WhatsApp spend) land in Phase 1 per
        docs/ROADMAP.md.
      </p>
    </div>
  );
}
