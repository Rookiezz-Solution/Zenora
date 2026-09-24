"use client";

import { useMemo, useState } from "react";
import type { Conversation, Message, QuickReply, WaTemplate } from "@/lib/inbox-types";

function isOutsideWindow(conversation: Conversation): boolean {
  if (conversation.channel !== "whatsapp") return false;
  return !conversation.windowExpiresAt || new Date(conversation.windowExpiresAt) < new Date();
}

export function ConversationThread({
  conversation,
  messages,
  quickReplies,
  templates,
  currentUserId,
  onSend,
  onToggleBot,
  onAssignToMe
}: {
  conversation: Conversation;
  messages: Message[];
  quickReplies: QuickReply[];
  templates: WaTemplate[];
  currentUserId: string | null;
  onSend: (input: { body?: string; templateId?: string }) => Promise<void>;
  onToggleBot: (active: boolean) => void;
  onAssignToMe: () => void;
}) {
  const [text, setText] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [sending, setSending] = useState(false);

  const outsideWindow = isOutsideWindow(conversation);

  const quickReplyMatches = useMemo(() => {
    if (!text.startsWith("/") || text.length < 1) return [];
    return quickReplies.filter((q) => q.shortcut.startsWith(text)).slice(0, 5);
  }, [text, quickReplies]);

  async function handleSend() {
    setSending(true);
    try {
      if (outsideWindow) {
        if (!templateId) return;
        await onSend({ templateId });
      } else {
        if (!text.trim()) return;
        await onSend({ body: text.trim() });
        setText("");
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3">
        <div>
          <p className="font-medium text-gray-900">
            {conversation.lead?.name || conversation.lead?.phone || conversation.lead?.email || "Unknown lead"}
          </p>
          <p className="text-xs text-gray-500">
            {conversation.channel === "instagram" ? "Instagram" : "WhatsApp"}
            {outsideWindow && " · outside 24h window — template required"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!conversation.assignedToId && currentUserId && (
            <button type="button" onClick={onAssignToMe} className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700">
              Assign to me
            </button>
          )}
          <button
            type="button"
            onClick={() => onToggleBot(!conversation.botActive)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium ${
              conversation.botActive ? "bg-brand-50 text-brand-700" : "bg-amber-50 text-amber-700"
            }`}
          >
            {conversation.botActive ? "Bot active — hand over" : "Bot paused — resume"}
          </button>
        </div>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto p-4">
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.direction === "outbound" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-md rounded-lg px-3 py-2 text-sm ${
                m.direction === "outbound" ? "bg-brand text-white" : "bg-white text-gray-900"
              }`}
            >
              {m.body}
            </div>
          </div>
        ))}
      </div>

      <div className="relative border-t border-gray-200 bg-white p-3">
        {quickReplyMatches.length > 0 && (
          <div className="absolute bottom-full left-3 mb-1 w-72 rounded-md border border-gray-200 bg-white shadow-md">
            {quickReplyMatches.map((q) => (
              <button
                key={q.id}
                type="button"
                onClick={() => setText(q.body)}
                className="block w-full px-3 py-2 text-left text-sm hover:bg-gray-50"
              >
                <span className="font-medium text-brand-700">{q.shortcut}</span>{" "}
                <span className="text-gray-500">{q.body}</span>
              </button>
            ))}
          </div>
        )}

        {outsideWindow ? (
          <div className="flex gap-2">
            <select
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">Choose an approved template…</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.language})
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleSend}
              disabled={!templateId || sending}
              className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              Send
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              placeholder="Type a message, or / for quick replies"
              className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={!text.trim() || sending}
              className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              Send
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
