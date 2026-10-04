"use client";

import { useCallback, useEffect, useState } from "react";
import { WORKSPACE_ROLES, canChangeMemberRole, canInviteWithRole, canRemoveMember, type WorkspaceRole } from "@zenora/shared";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import { apiFetch, type ApiError } from "@/lib/api";
import { useCurrentWorkspace } from "@/lib/use-workspace";

interface Member {
  id: string;
  userId: string;
  role: WorkspaceRole;
  viaAgencyId: string | null;
  user: { id: string; email: string; name: string | null };
}
interface Invite {
  id: string;
  email: string;
  role: WorkspaceRole;
  token: string;
  expiresAt: string;
}

const ROLE_LABEL: Record<WorkspaceRole, string> = { owner: "Owner", admin: "Admin", manager: "Manager", sales: "Salesperson", viewer: "Viewer" };
const input = "rounded-md border border-gray-300 px-2 py-1.5 text-sm";

export default function TeamPage() {
  const { workspaceId } = useCurrentWorkspace();
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [meId, setMeId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<WorkspaceRole>("sales");
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!workspaceId) return;
    apiFetch<Member[]>(`/workspaces/${workspaceId}/members`).then(setMembers).catch(() => setMembers([]));
    apiFetch<Invite[]>(`/workspaces/${workspaceId}/invites`).then(setInvites).catch(() => setInvites([])); // only people who may manage members can see these
  }, [workspaceId]);
  useEffect(load, [load]);
  useEffect(() => {
    apiFetch<{ id: string }>("/auth/me").then((u) => setMeId(u.id)).catch(() => setMeId(null));
  }, []);

  const me = members.find((m) => m.userId === meId);
  const ownerCount = members.filter((m) => m.role === "owner").length;
  const canManage = me?.role === "owner" || me?.role === "admin";
  const inviteLink = (token: string) => `${window.location.origin}/invite/${token}`;

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    if (!workspaceId) return;
    setMessage(null);
    try {
      const r = await apiFetch<{ emailed: boolean }>(`/workspaces/${workspaceId}/invites`, { method: "POST", body: JSON.stringify({ email: email.trim(), role }) });
      setMessage({ tone: "ok", text: r.emailed ? `Invitation emailed to ${email.trim()}.` : `Invitation created. Email is not set up, so copy the link below and send it to ${email.trim()} yourself.` });
      setEmail("");
      load();
    } catch (err) {
      setMessage({ tone: "error", text: (err as ApiError).message ?? "Could not send the invitation" });
    }
  }

  async function changeRole(m: Member, next: WorkspaceRole) {
    if (!workspaceId) return;
    setMessage(null);
    try {
      await apiFetch(`/workspaces/${workspaceId}/members/${m.id}`, { method: "PATCH", body: JSON.stringify({ role: next }) });
      load();
    } catch (err) {
      setMessage({ tone: "error", text: (err as ApiError).message ?? "Could not change the role" });
    }
  }

  async function remove(m: Member) {
    if (!workspaceId) return;
    const self = m.userId === meId;
    if (!confirm(self ? "Leave this workspace? You will lose access to it." : `Remove ${m.user.name || m.user.email}? They lose access straight away, and their leads become unassigned.`)) return;
    setMessage(null);
    try {
      await apiFetch(`/workspaces/${workspaceId}/members/${m.id}`, { method: "DELETE" });
      if (self) window.location.assign("/dashboard");
      else load();
    } catch (err) {
      setMessage({ tone: "error", text: (err as ApiError).message ?? "Could not remove the member" });
    }
  }

  async function revoke(inv: Invite) {
    if (!workspaceId) return;
    await apiFetch(`/workspaces/${workspaceId}/invites/${inv.id}`, { method: "DELETE" }).catch(() => undefined);
    load();
  }

  async function copy(inv: Invite) {
    try {
      await navigator.clipboard.writeText(inviteLink(inv.token));
      setCopied(inv.id);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setMessage({ tone: "error", text: `Copy this link: ${inviteLink(inv.token)}` });
    }
  }

  return (
    <div className="max-w-3xl">
      <SettingsTabs />
      <h1 className="text-2xl font-semibold text-gray-900">Team</h1>
      <p className="mt-1 text-sm text-gray-500">Owners control billing and the workspace, admins manage settings and people, managers and salespeople work with leads, viewers can only look.</p>

      {message && <p className={`mt-4 rounded-md px-3 py-2 text-sm ${message.tone === "ok" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>{message.text}</p>}

      <section className="mt-6 rounded-md border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-900">Members ({members.length})</h2>
        <ul className="mt-2 divide-y divide-gray-100">
          {members.map((m) => {
            const isSelf = m.userId === meId;
            const mayChange = me ? WORKSPACE_ROLES.some((r) => r !== m.role && canChangeMemberRole({ actorRole: me.role, targetRole: m.role, newRole: r, isSelf, ownerCount }).ok) : false;
            const mayRemove = me ? canRemoveMember({ actorRole: me.role, targetRole: m.role, isSelf, ownerCount }).ok : false;
            return (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span>
                  <span className="font-medium text-gray-900">{m.user.name || m.user.email}</span>
                  {isSelf && <span className="ml-1 text-xs text-gray-400">(you)</span>}
                  {m.viaAgencyId && <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] uppercase text-gray-500">agency</span>}
                  <span className="block text-xs text-gray-400">{m.user.email}</span>
                </span>
                <span className="flex items-center gap-3">
                  {mayChange ? (
                    <select value={m.role} onChange={(e) => changeRole(m, e.target.value as WorkspaceRole)} className={input}>
                      {WORKSPACE_ROLES.filter((r) => r === m.role || (me && canChangeMemberRole({ actorRole: me.role, targetRole: m.role, newRole: r, isSelf, ownerCount }).ok)).map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABEL[r]}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-gray-600">{ROLE_LABEL[m.role]}</span>
                  )}
                  {mayRemove && (
                    <button type="button" onClick={() => remove(m)} className="text-xs text-red-600 underline">
                      {isSelf ? "Leave" : "Remove"}
                    </button>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      {canManage && (
        <>
          <section className="mt-4 rounded-md border border-gray-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-gray-900">Invite someone</h2>
            <form onSubmit={invite} className="mt-2 flex flex-wrap items-center gap-2">
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email address" className={`${input} min-w-56 flex-1`} />
              <select value={role} onChange={(e) => setRole(e.target.value as WorkspaceRole)} className={input}>
                {WORKSPACE_ROLES.filter((r) => me && canInviteWithRole(me.role, r).ok).map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </select>
              <button type="submit" className="rounded-md bg-brand px-3 py-1.5 text-sm font-semibold text-white">
                Send invitation
              </button>
            </form>
            <p className="mt-2 text-xs text-gray-400">Your plan includes a number of seats; extra seats can be added under Billing and plan. The invitation only works for the address it was sent to.</p>
          </section>

          <section className="mt-4 rounded-md border border-gray-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-gray-900">Waiting to join ({invites.length})</h2>
            {invites.length === 0 ? (
              <p className="mt-2 text-sm text-gray-400">No pending invitations.</p>
            ) : (
              <ul className="mt-2 divide-y divide-gray-100">
                {invites.map((inv) => (
                  <li key={inv.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <span>
                      <span className="font-medium text-gray-900">{inv.email}</span> <span className="text-xs text-gray-400">{ROLE_LABEL[inv.role]} · expires {new Date(inv.expiresAt).toLocaleDateString()}</span>
                    </span>
                    <span className="flex gap-3 text-xs">
                      <button type="button" onClick={() => copy(inv)} className="text-brand-700 underline">
                        {copied === inv.id ? "Copied" : "Copy link"}
                      </button>
                      <button type="button" onClick={() => revoke(inv)} className="text-red-600 underline">
                        Cancel
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
