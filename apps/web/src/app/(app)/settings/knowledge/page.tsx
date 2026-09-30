"use client";

import { useEffect, useState } from "react";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import { apiFetch, type ApiError } from "@/lib/api";
import type { AiSettings, Faq, KnowledgeSource, KnowledgeSourceType, TestChatMessage, TestChatResult } from "@/lib/knowledge-types";
import { useCurrentWorkspace } from "@/lib/use-workspace";

const SOURCE_TYPES: { value: KnowledgeSourceType; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "pdf", label: "PDF (paste text)" },
  { value: "sheet", label: "Sheet (paste text)" },
  { value: "website", label: "Website URL" }
];

const STATUS_LABEL: Record<KnowledgeSource["status"], string> = { pending: "Processing…", ready: "Ready", failed: "Failed" };

export default function KnowledgePage() {
  const { workspaceId } = useCurrentWorkspace();
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [faqs, setFaqs] = useState<Faq[]>([]);
  const [settings, setSettings] = useState<AiSettings | null>(null);

  const [newType, setNewType] = useState<KnowledgeSourceType>("text");
  const [newName, setNewName] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [sourceError, setSourceError] = useState<string | null>(null);

  const [newQuestion, setNewQuestion] = useState("");
  const [newAnswer, setNewAnswer] = useState("");

  const [chatMessages, setChatMessages] = useState<TestChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  function load() {
    if (!workspaceId) return;
    apiFetch<KnowledgeSource[]>(`/knowledge/${workspaceId}/sources`).then(setSources).catch(() => setSources([]));
    apiFetch<Faq[]>(`/knowledge/${workspaceId}/faqs`).then(setFaqs).catch(() => setFaqs([]));
    apiFetch<AiSettings>(`/knowledge/${workspaceId}/settings`).then(setSettings).catch(() => setSettings(null));
  }
  useEffect(load, [workspaceId]);

  async function addSource(e: React.FormEvent) {
    e.preventDefault();
    if (!workspaceId || !newName.trim()) return;
    setSourceError(null);
    try {
      await apiFetch(`/knowledge/${workspaceId}/sources`, {
        method: "POST",
        body: JSON.stringify({
          type: newType,
          name: newName.trim(),
          ...(newType === "website" ? { sourceUrl: newUrl.trim() } : { content: newContent.trim() })
        })
      });
      setNewName("");
      setNewContent("");
      setNewUrl("");
      load();
    } catch (err) {
      setSourceError((err as ApiError).message ?? "Could not add source");
    }
  }

  async function removeSource(id: string) {
    if (!workspaceId) return;
    await apiFetch(`/knowledge/${workspaceId}/sources/${id}`, { method: "DELETE" });
    load();
  }

  async function generateFaqs(sourceId: string) {
    if (!workspaceId) return;
    setSourceError(null);
    try {
      await apiFetch(`/knowledge/${workspaceId}/faqs/generate`, { method: "POST", body: JSON.stringify({ sourceId }) });
      load();
    } catch (err) {
      setSourceError((err as ApiError).message ?? "Could not generate FAQs");
    }
  }

  async function addFaq(e: React.FormEvent) {
    e.preventDefault();
    if (!workspaceId || !newQuestion.trim() || !newAnswer.trim()) return;
    await apiFetch(`/knowledge/${workspaceId}/faqs`, {
      method: "POST",
      body: JSON.stringify({ question: newQuestion.trim(), answer: newAnswer.trim() })
    });
    setNewQuestion("");
    setNewAnswer("");
    load();
  }

  async function removeFaq(id: string) {
    if (!workspaceId) return;
    await apiFetch(`/knowledge/${workspaceId}/faqs/${id}`, { method: "DELETE" });
    load();
  }

  async function saveSettings() {
    if (!workspaceId || !settings) return;
    await apiFetch(`/knowledge/${workspaceId}/settings`, { method: "PATCH", body: JSON.stringify(settings) });
  }

  async function sendChat(e: React.FormEvent) {
    e.preventDefault();
    if (!workspaceId || !chatInput.trim()) return;
    const question = chatInput.trim();
    setChatMessages((m) => [...m, { role: "user", text: question }]);
    setChatInput("");
    setChatSending(true);
    setChatError(null);
    try {
      const result = await apiFetch<TestChatResult>(`/knowledge/${workspaceId}/test-chat`, {
        method: "POST",
        body: JSON.stringify({ question })
      });
      setChatMessages((m) => [...m, { role: "assistant", text: result.answer, citedSourceName: result.citedSourceName, handover: result.handover }]);
    } catch (err) {
      setChatError((err as ApiError).message ?? "Could not get an answer");
    } finally {
      setChatSending(false);
    }
  }

  if (!workspaceId) return <p className="text-sm text-gray-500">Log in and create a workspace first.</p>;

  return (
    <div className="max-w-2xl">
      <SettingsTabs />
      <h1 className="text-2xl font-semibold text-gray-900">AI knowledge</h1>
      <p className="mt-1 text-sm text-gray-500">Sources, FAQs and rules the AI answer bot uses — test it below before turning it on.</p>

      <section className="mt-6 rounded-md border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-900">Sources</h2>
        <ul className="mt-2 divide-y divide-gray-100">
          {sources.map((s) => (
            <li key={s.id} className="flex items-center justify-between py-1.5 text-sm">
              <span>
                {s.name} <span className="text-xs text-gray-400">({s.type})</span>{" "}
                <span className={`text-xs ${s.status === "failed" ? "text-red-600" : s.status === "ready" ? "text-green-600" : "text-gray-400"}`}>
                  {STATUS_LABEL[s.status]}
                </span>
                {s.errorMessage && <span className="ml-1 text-xs text-red-500">— {s.errorMessage}</span>}
              </span>
              <div className="flex items-center gap-2 text-xs">
                <button type="button" onClick={() => generateFaqs(s.id)} className="text-brand-700">
                  Generate FAQs
                </button>
                <button type="button" onClick={() => removeSource(s.id)} className="text-red-600">
                  Remove
                </button>
              </div>
            </li>
          ))}
          {sources.length === 0 && <li className="py-2 text-sm text-gray-400">No sources yet.</li>}
        </ul>
        <form onSubmit={addSource} className="mt-3 flex flex-col gap-2 border-t border-gray-100 pt-3">
          <div className="flex gap-2">
            <select
              value={newType}
              onChange={(e) => setNewType(e.target.value as KnowledgeSourceType)}
              className="rounded-md border border-gray-300 px-2 py-1 text-xs"
            >
              {SOURCE_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Name (e.g. Refund policy)"
              className="flex-1 rounded-md border border-gray-300 px-2 py-1 text-xs"
            />
          </div>
          {newType === "website" ? (
            <input
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              placeholder="https://example.com/faq"
              className="rounded-md border border-gray-300 px-2 py-1 text-xs"
            />
          ) : (
            <textarea
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              placeholder={newType === "text" ? "Paste the source text…" : "Paste the extracted text from the file…"}
              rows={3}
              className="rounded-md border border-gray-300 px-2 py-1 text-xs"
            />
          )}
          {sourceError && <p className="text-xs text-red-600">{sourceError}</p>}
          <button type="submit" className="self-start rounded-md bg-brand px-3 py-1 text-xs font-semibold text-white">
            Add source
          </button>
        </form>
      </section>

      <section className="mt-6 rounded-md border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-900">FAQs</h2>
        <ul className="mt-2 divide-y divide-gray-100">
          {faqs.map((f) => (
            <li key={f.id} className="py-1.5 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium">{f.question}</span>
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <span>used {f.usageCount}×</span>
                  <button type="button" onClick={() => removeFaq(f.id)} className="text-red-600">
                    Remove
                  </button>
                </div>
              </div>
              <p className="text-xs text-gray-500">{f.answer}</p>
            </li>
          ))}
          {faqs.length === 0 && <li className="py-2 text-sm text-gray-400">No FAQs yet.</li>}
        </ul>
        <form onSubmit={addFaq} className="mt-3 flex flex-col gap-2 border-t border-gray-100 pt-3">
          <input
            value={newQuestion}
            onChange={(e) => setNewQuestion(e.target.value)}
            placeholder="Question"
            className="rounded-md border border-gray-300 px-2 py-1 text-xs"
          />
          <input
            value={newAnswer}
            onChange={(e) => setNewAnswer(e.target.value)}
            placeholder="Answer"
            className="rounded-md border border-gray-300 px-2 py-1 text-xs"
          />
          <button type="submit" className="self-start rounded-md bg-brand px-3 py-1 text-xs font-semibold text-white">
            Add FAQ
          </button>
        </form>
      </section>

      {settings && (
        <section className="mt-6 rounded-md border border-gray-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-gray-900">Rules and tone</h2>
          <div className="mt-2 flex flex-col gap-2 text-sm">
            <label className="flex items-center gap-2">
              <span className="w-40 text-gray-600">Tone</span>
              <input
                value={settings.tone}
                onChange={(e) => setSettings({ ...settings, tone: e.target.value })}
                className="rounded-md border border-gray-300 px-2 py-1 text-xs"
              />
            </label>
            <label className="flex items-center gap-2">
              <span className="w-40 text-gray-600">Languages (comma-separated)</span>
              <input
                value={settings.languages.join(", ")}
                onChange={(e) => setSettings({ ...settings, languages: e.target.value.split(",").map((l) => l.trim()).filter(Boolean) })}
                className="rounded-md border border-gray-300 px-2 py-1 text-xs"
              />
            </label>
            {(
              [
                ["answerOnlyFromSources", "Only answer from sources"],
                ["handoverWhenUnsure", "Hand over when unsure"],
                ["handoverOnDiscountAsked", "Hand over when a discount is asked for"],
                ["alwaysEndWithNextStep", "Always end with a next step"],
                ["replyInLeadsLanguage", "Reply in the lead's language"],
                ["sharePricesToggle", "Allow sharing prices"]
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 text-xs text-gray-600">
                <input type="checkbox" checked={settings[key]} onChange={(e) => setSettings({ ...settings, [key]: e.target.checked })} />
                {label}
              </label>
            ))}
            <button type="button" onClick={saveSettings} className="mt-1 self-start rounded-md bg-brand px-3 py-1 text-xs font-semibold text-white">
              Save
            </button>
          </div>
        </section>
      )}

      <section className="mt-6 rounded-md border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-900">Test chat</h2>
        <p className="mt-1 text-xs text-gray-400">Try the bot with a real question — it answers from your sources and FAQs above.</p>
        <div className="mt-2 max-h-64 space-y-2 overflow-y-auto rounded-md bg-gray-50 p-2">
          {chatMessages.map((m, i) => (
            <div key={i} className={`text-sm ${m.role === "user" ? "text-right" : "text-left"}`}>
              <span className={`inline-block rounded-md px-2 py-1 ${m.role === "user" ? "bg-brand-100 text-brand-900" : "bg-white text-gray-800"}`}>
                {m.text}
              </span>
              {m.role === "assistant" && (m.citedSourceName || m.handover) && (
                <p className="mt-0.5 text-xs text-gray-400">
                  {m.citedSourceName && `Source: ${m.citedSourceName}`}
                  {m.citedSourceName && m.handover && " — "}
                  {m.handover && "would hand over to a human"}
                </p>
              )}
            </div>
          ))}
          {chatMessages.length === 0 && <p className="text-sm text-gray-400">Ask a question to test the bot.</p>}
        </div>
        <form onSubmit={sendChat} className="mt-2 flex gap-2">
          <input
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            placeholder="Ask a question…"
            className="flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm"
          />
          <button type="submit" disabled={chatSending} className="rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
            {chatSending ? "Thinking…" : "Send"}
          </button>
        </form>
        {chatError && <p className="mt-1 text-xs text-red-600">{chatError}</p>}
      </section>
    </div>
  );
}
