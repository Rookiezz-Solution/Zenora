"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { Notification } from "@/lib/notification-types";
import { useCurrentWorkspace } from "@/lib/use-workspace";
import { NoWorkspace } from "@/components/no-workspace";

export default function NotificationsPage() {
  const { workspaceId, loading: workspaceLoading } = useCurrentWorkspace();
  const [notifications, setNotifications] = useState<Notification[]>([]);

  function load() {
    if (!workspaceId) return;
    apiFetch<Notification[]>(`/notifications/${workspaceId}`).then(setNotifications).catch(() => setNotifications([]));
  }
  useEffect(load, [workspaceId]);

  async function markRead(id: string) {
    if (!workspaceId) return;
    await apiFetch(`/notifications/${workspaceId}/${id}/read`, { method: "PATCH" });
    load();
  }

  if (!workspaceId) return <NoWorkspace loading={workspaceLoading} />;

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold text-gray-900">Notifications</h1>
      <p className="mt-1 text-sm text-gray-500">Workspace-wide alerts — billing, AI credits, and more.</p>

      <ul className="mt-4 divide-y divide-gray-100 rounded-md border border-gray-200 bg-white">
        {notifications.map((n) => (
          <li key={n.id} className={`flex items-start justify-between gap-3 px-4 py-3 text-sm ${n.readAt ? "" : "bg-brand-50/40"}`}>
            <div>
              <p className="font-medium text-gray-900">{n.title}</p>
              {n.body && <p className="mt-0.5 text-xs text-gray-500">{n.body}</p>}
              <p className="mt-1 text-xs text-gray-400">{new Date(n.createdAt).toLocaleString()}</p>
            </div>
            {!n.readAt && (
              <button type="button" onClick={() => markRead(n.id)} className="shrink-0 text-xs text-brand-700">
                Mark read
              </button>
            )}
          </li>
        ))}
        {notifications.length === 0 && <li className="px-4 py-6 text-center text-sm text-gray-400">No notifications yet.</li>}
      </ul>
    </div>
  );
}
