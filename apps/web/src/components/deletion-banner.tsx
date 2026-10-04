"use client";

import Link from "next/link";
import { useCurrentWorkspace } from "@/lib/use-workspace";

// Shown on every page while the current workspace is scheduled for deletion, so
// nobody is surprised when it disappears.
export function DeletionBanner() {
  const { workspaceId, workspaces } = useCurrentWorkspace();
  const current = workspaces.find((w) => w.id === workspaceId);
  if (!current?.deletionScheduledAt) return null;

  return (
    <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
      This workspace will be permanently deleted on <span className="font-semibold">{new Date(current.deletionScheduledAt).toLocaleString()}</span>.{" "}
      <Link href="/settings/privacy" className="font-medium underline">
        Cancel the deletion
      </Link>
    </div>
  );
}
