import type { Conversation, ConversationFilter } from "@/lib/inbox-types";

const FILTERS: { value: ConversationFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "mine", label: "Mine" },
  { value: "unassigned", label: "Unassigned" },
  { value: "bot_active", label: "Bot active" },
  { value: "waiting_on_us", label: "Waiting on us" }
];

export function ConversationList({
  conversations,
  filter,
  onFilterChange,
  selectedId,
  onSelect
}: {
  conversations: Conversation[];
  filter: ConversationFilter;
  onFilterChange: (f: ConversationFilter) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex w-80 shrink-0 flex-col border-r border-gray-200 bg-white">
      <div className="flex gap-1 overflow-x-auto border-b border-gray-200 p-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => onFilterChange(f.value)}
            className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium ${
              filter === f.value ? "bg-brand text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {conversations.length === 0 && <p className="p-4 text-sm text-gray-400">No conversations.</p>}
        {conversations.map((c) => {
          const last = c.messages[0];
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onSelect(c.id)}
              className={`block w-full border-b border-gray-100 p-3 text-left hover:bg-gray-50 ${
                selectedId === c.id ? "bg-brand-50" : ""
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="truncate text-sm font-medium text-gray-900">
                  {c.lead?.name || c.lead?.phone || c.lead?.email || "Unknown lead"}
                </span>
                <span className="ml-2 shrink-0 rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] uppercase text-gray-500">
                  {c.channel}
                </span>
              </div>
              {last && <p className="mt-0.5 truncate text-xs text-gray-500">{last.body}</p>}
              {!c.botActive && <span className="mt-1 inline-block text-[10px] font-medium text-amber-600">Bot paused</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
