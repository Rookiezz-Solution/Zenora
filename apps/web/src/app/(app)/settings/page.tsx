"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { startWhatsappEmbeddedSignup } from "@/lib/whatsapp-embedded-signup";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

interface Workspace {
  id: string;
  name: string;
}

export default function SettingsPage() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<Workspace[]>("/workspaces")
      .then((workspaces) => setWorkspace(workspaces[0] ?? null))
      .catch(() => setWorkspace(null));
  }, []);

  async function connectWhatsapp() {
    if (!workspace) return;
    setStatus(null);
    try {
      const result = await startWhatsappEmbeddedSignup();
      await apiFetch(`/channels/whatsapp/connect/${workspace.id}`, {
        method: "POST",
        body: JSON.stringify(result)
      });
      setStatus("WhatsApp connected.");
    } catch (err) {
      setStatus((err as { message?: string }).message ?? "Could not connect WhatsApp");
    }
  }

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-semibold text-gray-900">Connect channels</h1>
      <p className="mt-1 text-sm text-gray-500">
        Official Meta APIs only — you connect your own Instagram account and WhatsApp number.
      </p>

      {!workspace ? (
        <p className="mt-6 text-sm text-gray-500">Log in and create a workspace first.</p>
      ) : (
        <div className="mt-6 space-y-4">
          <div className="flex items-center justify-between rounded-md border border-gray-200 p-4">
            <div>
              <p className="font-medium text-gray-900">Instagram</p>
              <p className="text-sm text-gray-500">DMs, comments, story replies, follow gate.</p>
            </div>
            <a
              href={`${API_URL}/channels/instagram/connect/${workspace.id}`}
              className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white"
            >
              Connect
            </a>
          </div>

          <div className="flex items-center justify-between rounded-md border border-gray-200 p-4">
            <div>
              <p className="font-medium text-gray-900">WhatsApp</p>
              <p className="text-sm text-gray-500">Your own number via Embedded Signup.</p>
            </div>
            <button
              type="button"
              onClick={connectWhatsapp}
              className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white"
            >
              Connect
            </button>
          </div>

          {status && <p className="text-sm text-gray-600">{status}</p>}
        </div>
      )}
    </div>
  );
}
