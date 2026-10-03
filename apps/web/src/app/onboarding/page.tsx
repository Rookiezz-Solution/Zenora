"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { WORKSPACE_ROLES } from "@zenora/shared";
import { apiFetch } from "@/lib/api";
import { clearReferral, pendingReferral } from "@/lib/referral-capture";
import type { Automation, FlowTemplate } from "@/lib/automation-types";
import { startWhatsappEmbeddedSignup } from "@/lib/whatsapp-embedded-signup";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const INDUSTRIES = [
  "coaching",
  "clinic",
  "salon",
  "real_estate",
  "d2c",
  "travel",
  "creator",
  "local_services",
  "agency",
  "other"
];

const STEPS = ["Business", "Connect channels", "Invite team", "Pick a bot", "Go live"];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);

  // Step 1
  const [name, setName] = useState("");
  const [mode, setMode] = useState<"team" | "creator">("team");
  const [industry, setIndustry] = useState("coaching");
  const [error, setError] = useState<string | null>(null);

  // Step 2
  const [channelStatus, setChannelStatus] = useState<string | null>(null);

  // Step 3
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<(typeof WORKSPACE_ROLES)[number]>("sales");
  const [invited, setInvited] = useState<string[]>([]);
  const [inviteError, setInviteError] = useState<string | null>(null);

  // Step 4
  const [templates, setTemplates] = useState<FlowTemplate[]>([]);
  const [pickedBot, setPickedBot] = useState<string | null>(null);

  async function createWorkspace(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setError(null);
    try {
      const workspace = await apiFetch<{ id: string }>("/workspaces", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), mode, industry, ref: pendingReferral() })
      });
      clearReferral();
      setWorkspaceId(workspace.id);
      setStep(1);
    } catch (err) {
      setError((err as { message?: string }).message ?? "Could not create workspace");
    }
  }

  async function connectWhatsapp() {
    if (!workspaceId) return;
    setChannelStatus(null);
    try {
      const result = await startWhatsappEmbeddedSignup();
      await apiFetch(`/channels/whatsapp/connect/${workspaceId}`, { method: "POST", body: JSON.stringify(result) });
      setChannelStatus("WhatsApp connected.");
    } catch (err) {
      setChannelStatus((err as { message?: string }).message ?? "Could not connect WhatsApp");
    }
  }

  async function sendInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!workspaceId || !inviteEmail.trim()) return;
    setInviteError(null);
    try {
      await apiFetch(`/workspaces/${workspaceId}/invites`, {
        method: "POST",
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole })
      });
      setInvited((v) => [...v, inviteEmail.trim()]);
      setInviteEmail("");
    } catch (err) {
      setInviteError((err as { message?: string }).message ?? "Could not send invite");
    }
  }

  function loadTemplates() {
    if (!workspaceId) return;
    apiFetch<FlowTemplate[]>(`/flow-templates/${workspaceId}?scope=public&industry=${industry}`)
      .then(setTemplates)
      .catch(() => setTemplates([]));
  }

  async function useBot(template: FlowTemplate) {
    if (!workspaceId) return;
    await apiFetch<Automation>(`/flow-templates/${workspaceId}/${template.id}/use`, {
      method: "POST",
      body: JSON.stringify({ name: template.name })
    });
    setPickedBot(template.name);
  }

  function goToStep(next: number) {
    setStep(next);
    if (next === 3) loadTemplates();
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-6 px-4 py-10">
      <div className="flex items-center gap-1">
        {STEPS.map((label, i) => (
          <div key={label} className={`h-1 flex-1 rounded-full ${i <= step ? "bg-brand" : "bg-gray-200"}`} />
        ))}
      </div>
      <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
        Step {step + 1} of {STEPS.length} — {STEPS[step]}
      </p>

      {step === 0 && (
        <form onSubmit={createWorkspace} className="flex flex-col gap-3">
          <h1 className="text-xl font-semibold text-gray-900">Tell us about your business</h1>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Business name"
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <div className="flex gap-2 text-sm">
            <label className="flex items-center gap-1">
              <input type="radio" checked={mode === "team"} onChange={() => setMode("team")} /> Team mode
            </label>
            <label className="flex items-center gap-1">
              <input type="radio" checked={mode === "creator"} onChange={() => setMode("creator")} /> Creator mode
            </label>
          </div>
          <select value={industry} onChange={(e) => setIndustry(e.target.value)} className="rounded-md border border-gray-300 px-3 py-2 text-sm">
            {INDUSTRIES.map((i) => (
              <option key={i} value={i}>
                {i.replace("_", " ")}
              </option>
            ))}
          </select>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button type="submit" className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white">
            Continue
          </button>
        </form>
      )}

      {step === 1 && (
        <div className="flex flex-col gap-3">
          <h1 className="text-xl font-semibold text-gray-900">Connect your channels</h1>
          <p className="text-sm text-gray-500">Official Meta APIs only — connect your own Instagram and WhatsApp.</p>
          <a
            href={`${API_URL}/channels/instagram/connect/${workspaceId}`}
            className="rounded-md border border-gray-300 px-4 py-2 text-center text-sm font-medium"
          >
            Connect Instagram
          </a>
          <button type="button" onClick={connectWhatsapp} className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium">
            Connect WhatsApp
          </button>
          {channelStatus && <p className="text-sm text-gray-600">{channelStatus}</p>}
          <button type="button" onClick={() => goToStep(2)} className="mt-2 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white">
            Continue
          </button>
          <button type="button" onClick={() => goToStep(2)} className="text-sm text-gray-500">
            Skip for now
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="flex flex-col gap-3">
          <h1 className="text-xl font-semibold text-gray-900">Invite your team</h1>
          <form onSubmit={sendInvite} className="flex gap-2">
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="teammate@business.com"
              className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as (typeof WORKSPACE_ROLES)[number])}
              className="rounded-md border border-gray-300 px-2 py-2 text-sm"
            >
              {WORKSPACE_ROLES.filter((r) => r !== "owner").map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <button type="submit" className="rounded-md border border-gray-300 px-3 py-2 text-sm">
              Invite
            </button>
          </form>
          {invited.length > 0 && <p className="text-xs text-gray-500">Invited: {invited.join(", ")}</p>}
          {inviteError && <p className="text-sm text-red-600">{inviteError}</p>}
          <button type="button" onClick={() => goToStep(3)} className="mt-2 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white">
            Continue
          </button>
          <button type="button" onClick={() => goToStep(3)} className="text-sm text-gray-500">
            Skip for now
          </button>
        </div>
      )}

      {step === 3 && (
        <div className="flex flex-col gap-3">
          <h1 className="text-xl font-semibold text-gray-900">Pick a first bot</h1>
          <p className="text-sm text-gray-500">A starter kit for your industry — you can edit it afterward.</p>
          <ul className="divide-y divide-gray-100 rounded-md border border-gray-200 bg-white">
            {templates.map((t) => (
              <li key={t.id} className="flex items-center justify-between px-3 py-2 text-sm">
                {t.name}
                <button type="button" onClick={() => useBot(t)} className="rounded-md border border-gray-300 px-2 py-1 text-xs">
                  Use this
                </button>
              </li>
            ))}
            {templates.length === 0 && <li className="px-3 py-4 text-sm text-gray-400">No starter kits for this industry yet.</li>}
          </ul>
          {pickedBot && <p className="text-sm text-green-600">Created "{pickedBot}" — edit it anytime from Automations.</p>}
          <button type="button" onClick={() => goToStep(4)} className="mt-2 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white">
            Continue
          </button>
          <button type="button" onClick={() => goToStep(4)} className="text-sm text-gray-500">
            Skip for now
          </button>
        </div>
      )}

      {step === 4 && (
        <div className="flex flex-col gap-3">
          <h1 className="text-xl font-semibold text-gray-900">You're almost live</h1>
          <ul className="space-y-2 text-sm text-gray-700">
            <li>✓ Workspace created</li>
            <li>{channelStatus?.includes("connected") ? "✓" : "○"} Channels connected</li>
            <li>{invited.length > 0 ? "✓" : "○"} Team invited</li>
            <li>{pickedBot ? "✓" : "○"} First bot picked</li>
          </ul>
          <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">
            Don't forget to add a payment method to your Meta Business account, or WhatsApp sends will fail once you go past the free tier.
          </p>
          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="mt-2 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white"
          >
            Go to dashboard
          </button>
        </div>
      )}
    </main>
  );
}
