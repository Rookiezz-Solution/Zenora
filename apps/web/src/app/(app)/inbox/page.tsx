"use client";

import { useEffect, useState } from "react";
import { ConversationList } from "@/components/inbox/conversation-list";
import { ConversationThread } from "@/components/inbox/conversation-thread";
import { apiFetch } from "@/lib/api";
import type { Conversation, ConversationFilter, Message, QuickReply, WaTemplate } from "@/lib/inbox-types";
import { getSocket } from "@/lib/socket";
import { useCurrentUser } from "@/lib/use-current-user";
import { useCurrentWorkspace } from "@/lib/use-workspace";

export default function InboxPage() {
  const { workspaceId } = useCurrentWorkspace();
  const { userId: currentUserId } = useCurrentUser();
  const [filter, setFilter] = useState<ConversationFilter>("all");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>([]);
  const [templates, setTemplates] = useState<WaTemplate[]>([]);

  const selected = conversations.find((c) => c.id === selectedId) ?? null;

  function loadConversations(ws: string, f: ConversationFilter) {
    const query = f === "all" ? "" : `?filter=${f}`;
    apiFetch<Conversation[]>(`/inbox/${ws}/conversations${query}`)
      .then(setConversations)
      .catch(() => setConversations([]));
  }

  useEffect(() => {
    if (!workspaceId) return;
    loadConversations(workspaceId, filter);
  }, [workspaceId, filter]);

  useEffect(() => {
    if (!workspaceId || !selectedId) {
      setMessages([]);
      return;
    }
    apiFetch<{ messages: Message[] }>(`/inbox/${workspaceId}/conversations/${selectedId}/messages`)
      .then((res) => setMessages(res.messages))
      .catch(() => setMessages([]));
  }, [workspaceId, selectedId]);

  useEffect(() => {
    if (!workspaceId) return;
    apiFetch<QuickReply[]>(`/workspaces/${workspaceId}/quick-replies`).then(setQuickReplies).catch(() => setQuickReplies([]));
    apiFetch<WaTemplate[]>(`/workspaces/${workspaceId}/templates`).then(setTemplates).catch(() => setTemplates([]));
  }, [workspaceId]);

  // Realtime: join the workspace room, refresh on new messages/updates.
  useEffect(() => {
    if (!workspaceId) return;
    const socket = getSocket();
    socket.emit("join-workspace", workspaceId);

    function onMessageCreated(message: Message) {
      setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
      loadConversations(workspaceId!, filter);
    }
    function onConversationUpdated() {
      loadConversations(workspaceId!, filter);
    }

    socket.on("message.created", onMessageCreated);
    socket.on("conversation.updated", onConversationUpdated);
    return () => {
      socket.off("message.created", onMessageCreated);
      socket.off("conversation.updated", onConversationUpdated);
    };
  }, [workspaceId, filter]);

  async function handleSend(input: { body?: string; templateId?: string }) {
    if (!workspaceId || !selectedId) return;
    await apiFetch(`/inbox/${workspaceId}/conversations/${selectedId}/messages`, {
      method: "POST",
      body: JSON.stringify(input)
    });
  }

  async function handleToggleBot(active: boolean) {
    if (!workspaceId || !selectedId) return;
    await apiFetch(`/inbox/${workspaceId}/conversations/${selectedId}/handover`, {
      method: "POST",
      body: JSON.stringify({ active })
    });
    loadConversations(workspaceId, filter);
  }

  async function handleAssignToMe() {
    if (!workspaceId || !selectedId || !currentUserId) return;
    await apiFetch(`/inbox/${workspaceId}/conversations/${selectedId}/assign`, {
      method: "PATCH",
      body: JSON.stringify({ userId: currentUserId })
    });
    loadConversations(workspaceId, filter);
  }

  if (!workspaceId) {
    return <p className="text-sm text-gray-500">Log in and create a workspace first.</p>;
  }

  return (
    <div className="-m-6 flex h-[calc(100vh-0px)]">
      <ConversationList
        conversations={conversations}
        filter={filter}
        onFilterChange={setFilter}
        selectedId={selectedId}
        onSelect={setSelectedId}
      />
      {selected ? (
        <ConversationThread
          conversation={selected}
          messages={messages}
          quickReplies={quickReplies}
          templates={templates}
          currentUserId={currentUserId}
          onSend={handleSend}
          onToggleBot={handleToggleBot}
          onAssignToMe={handleAssignToMe}
        />
      ) : (
        <div className="flex flex-1 items-center justify-center text-sm text-gray-400">
          Select a conversation.
        </div>
      )}
    </div>
  );
}
