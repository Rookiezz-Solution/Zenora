"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { WorkspaceRole } from "@zenora/shared";
import { apiFetch, type ApiError } from "@/lib/api";
import { withNext } from "@/lib/next-url";
import { switchWorkspace } from "@/lib/use-workspace";

type Info = { valid: false } | { valid: true; workspaceName: string; role: string; email: string };

// A Record over every role, so adding a role to the shared package fails to compile here until it has a label.
const ROLE_TEXT: Record<WorkspaceRole, string> = {
  owner: "an owner",
  admin: "an admin",
  manager: "a manager",
  sales: "a salesperson",
  viewer: "a viewer"
};

// The page an invitation email links to. It works whether or not the person
// already has an account: they sign in or sign up (with the address the invite
// was sent to), then come straight back here to join.
export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const [info, setInfo] = useState<Info | null>(null);
  const [me, setMe] = useState<{ email: string } | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const here = `/invite/${token}`;

  useEffect(() => {
    apiFetch<Info>(`/public/invites/${token}`).then(setInfo).catch(() => setInfo({ valid: false }));
    apiFetch<{ email: string }>("/auth/me").then(setMe).catch(() => setMe(null));
  }, [token]);

  async function join() {
    setBusy(true);
    setError(null);
    try {
      const membership = await apiFetch<{ workspaceId: string }>(`/workspaces/invites/${token}/accept`, { method: "POST" });
      switchWorkspace(membership.workspaceId);
    } catch (err) {
      setError((err as ApiError).message ?? "Could not join. Try again.");
      setBusy(false);
    }
  }

  async function signOut() {
    await apiFetch("/auth/logout", { method: "POST" }).catch(() => undefined);
    setMe(null);
  }

  if (!info || me === undefined) return <main className="mx-auto max-w-sm p-6 text-center text-sm text-gray-400">Loading…</main>;

  if (!info.valid) {
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-3 px-4 text-center">
        <h1 className="text-xl font-semibold text-gray-900">This invitation is no longer valid</h1>
        <p className="text-sm text-gray-500">It may have expired, been used already, or been cancelled. Ask the person who invited you to send a new one.</p>
        <Link href="/login" className="text-sm text-brand-700 underline">
          Go to log in
        </Link>
      </main>
    );
  }

  const wrongAccount = me !== null && me.email.toLowerCase() !== info.email.toLowerCase();

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 px-4 text-center">
      <p className="text-xs uppercase tracking-wide text-gray-400">You are invited</p>
      <h1 className="text-2xl font-semibold text-gray-900">Join {info.workspaceName}</h1>
      <p className="text-sm text-gray-600">
        You have been invited as {ROLE_TEXT[info.role as WorkspaceRole] ?? info.role} (<span className="font-medium">{info.email}</span>).
      </p>

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}

      {me === null && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-gray-500">Use the email address above to sign in or create your account.</p>
          <Link href={withNext("/signup", here)} className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white">
            Create an account
          </Link>
          <Link href={withNext("/login", here)} className="rounded-md border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700">
            I already have an account
          </Link>
        </div>
      )}

      {me && !wrongAccount && (
        <button type="button" disabled={busy} onClick={join} className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {busy ? "Joining…" : `Join ${info.workspaceName}`}
        </button>
      )}

      {me && wrongAccount && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-amber-800">
            You are signed in as <span className="font-medium">{me.email}</span>, but this invitation is for <span className="font-medium">{info.email}</span>.
          </p>
          <button type="button" onClick={signOut} className="rounded-md border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700">
            Sign out and use the right account
          </button>
        </div>
      )}
    </main>
  );
}

