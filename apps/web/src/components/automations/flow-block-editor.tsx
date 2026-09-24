"use client";

import { useState } from "react";
import type { BlockType, FlowBlock, FlowGraph, QuickReplyOption } from "@/lib/automation-types";

const BLOCK_LABELS: Record<BlockType, string> = {
  send_text: "Send a message",
  send_quick_replies: "Send with quick replies",
  condition: "Condition (branch)",
  wait: "Wait",
  tag: "Add tag",
  move_stage: "Move to stage",
  assign: "Assign to",
  handover: "Hand over to human"
};

let idCounter = 0;
function newBlockId() {
  idCounter += 1;
  return `b${Date.now()}_${idCounter}`;
}

function defaultBlock(type: BlockType): FlowBlock {
  const id = newBlockId();
  switch (type) {
    case "send_text":
      return { id, type, body: "", next: null };
    case "send_quick_replies":
      return { id, type, body: "", options: [{ label: "", next: null }] };
    case "condition":
      return { id, type, field: "tag", operator: "equals", value: "", ifTrue: null, ifFalse: null };
    case "wait":
      return { id, type, minutes: 60, next: null };
    case "tag":
      return { id, type, tagName: "", next: null };
    case "move_stage":
      return { id, type, stageId: "", next: null };
    case "assign":
      return { id, type, userId: null, next: null };
    case "handover":
      return { id, type };
  }
}

function graphToList(graph: FlowGraph | undefined): FlowBlock[] {
  if (!graph || Object.keys(graph.blocks).length === 0) return [];
  // Best-effort linear ordering starting at startBlockId, following the
  // primary `next` pointer — good enough for the list UI even though the
  // underlying graph can branch elsewhere.
  const visited = new Set<string>();
  const ordered: FlowBlock[] = [];
  let currentId: string | null = graph.startBlockId;
  while (currentId && graph.blocks[currentId] && !visited.has(currentId)) {
    visited.add(currentId);
    const block = graph.blocks[currentId] as FlowBlock;
    ordered.push(block);
    currentId = block.next ?? null;
  }
  for (const block of Object.values(graph.blocks)) {
    if (!visited.has(block.id)) ordered.push(block);
  }
  return ordered;
}

export function FlowBlockEditor({
  initialGraph,
  stages,
  members,
  onChange
}: {
  initialGraph?: FlowGraph;
  stages: { id: string; name: string }[];
  members: { id: string; name: string | null; email: string }[];
  onChange: (graph: FlowGraph) => void;
}) {
  const [blocks, setBlocks] = useState<FlowBlock[]>(() => graphToList(initialGraph));

  function emit(next: FlowBlock[]) {
    setBlocks(next);
    const graph: FlowGraph = {
      startBlockId: next[0]?.id ?? "",
      blocks: Object.fromEntries(next.map((b) => [b.id, b]))
    };
    onChange(graph);
  }

  function addBlock(type: BlockType) {
    emit([...blocks, defaultBlock(type)]);
  }

  function updateBlock(id: string, patch: Partial<FlowBlock>) {
    emit(blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  }

  function removeBlock(id: string) {
    emit(blocks.filter((b) => b.id !== id));
  }

  function move(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= blocks.length) return;
    const next = [...blocks];
    [next[index], next[target]] = [next[target]!, next[index]!];
    emit(next);
  }

  const targetOptions = [{ id: "", label: "End the flow" }, ...blocks.map((b) => ({ id: b.id, label: `${BLOCK_LABELS[b.type]} (${b.id.slice(-4)})` }))];

  return (
    <div className="space-y-3">
      {blocks.map((block, index) => (
        <div key={block.id} className="rounded-md border border-gray-200 bg-white p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase text-brand-700">
              {index === 0 && "Start · "}
              {BLOCK_LABELS[block.type]}
            </span>
            <div className="flex gap-1 text-xs text-gray-400">
              <button type="button" onClick={() => move(index, -1)} disabled={index === 0}>
                ↑
              </button>
              <button type="button" onClick={() => move(index, 1)} disabled={index === blocks.length - 1}>
                ↓
              </button>
              <button type="button" onClick={() => removeBlock(block.id)} className="text-red-600">
                Remove
              </button>
            </div>
          </div>

          <div className="mt-2 space-y-2 text-sm">
            {block.type === "send_text" && (
              <>
                <textarea
                  value={block.body ?? ""}
                  onChange={(e) => updateBlock(block.id, { body: e.target.value })}
                  placeholder="Message text"
                  rows={2}
                  className="w-full rounded-md border border-gray-300 px-2 py-1.5"
                />
                <NextSelect value={block.next ?? ""} options={targetOptions} onChange={(v) => updateBlock(block.id, { next: v || null })} />
              </>
            )}

            {block.type === "send_quick_replies" && (
              <QuickRepliesFields block={block} targetOptions={targetOptions} onChange={(patch) => updateBlock(block.id, patch)} />
            )}

            {block.type === "condition" && (
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={block.field}
                  onChange={(e) => updateBlock(block.id, { field: e.target.value as FlowBlock["field"] })}
                  className="rounded-md border border-gray-300 px-2 py-1.5"
                >
                  <option value="tag">Tag</option>
                  <option value="stage">Stage</option>
                  <option value="score">Score</option>
                </select>
                <select
                  value={block.operator}
                  onChange={(e) => updateBlock(block.id, { operator: e.target.value as FlowBlock["operator"] })}
                  className="rounded-md border border-gray-300 px-2 py-1.5"
                >
                  <option value="equals">equals</option>
                  <option value="contains">contains</option>
                  <option value="gte">&gt;=</option>
                </select>
                <input
                  value={block.value ?? ""}
                  onChange={(e) => updateBlock(block.id, { value: e.target.value })}
                  placeholder="Value"
                  className="col-span-2 rounded-md border border-gray-300 px-2 py-1.5"
                />
                <label className="col-span-2 flex items-center gap-2">
                  If true, go to:
                  <NextSelect value={block.ifTrue ?? ""} options={targetOptions} onChange={(v) => updateBlock(block.id, { ifTrue: v || null })} />
                </label>
                <label className="col-span-2 flex items-center gap-2">
                  If false, go to:
                  <NextSelect value={block.ifFalse ?? ""} options={targetOptions} onChange={(v) => updateBlock(block.id, { ifFalse: v || null })} />
                </label>
              </div>
            )}

            {block.type === "wait" && (
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  value={block.minutes ?? 60}
                  onChange={(e) => updateBlock(block.id, { minutes: Number(e.target.value) })}
                  className="w-24 rounded-md border border-gray-300 px-2 py-1.5"
                />
                minutes, then
                <NextSelect value={block.next ?? ""} options={targetOptions} onChange={(v) => updateBlock(block.id, { next: v || null })} />
              </div>
            )}

            {block.type === "tag" && (
              <>
                <input
                  value={block.tagName ?? ""}
                  onChange={(e) => updateBlock(block.id, { tagName: e.target.value })}
                  placeholder="Tag name"
                  className="w-full rounded-md border border-gray-300 px-2 py-1.5"
                />
                <NextSelect value={block.next ?? ""} options={targetOptions} onChange={(v) => updateBlock(block.id, { next: v || null })} />
              </>
            )}

            {block.type === "move_stage" && (
              <>
                <select
                  value={block.stageId ?? ""}
                  onChange={(e) => updateBlock(block.id, { stageId: e.target.value })}
                  className="w-full rounded-md border border-gray-300 px-2 py-1.5"
                >
                  <option value="">Choose a stage…</option>
                  {stages.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <NextSelect value={block.next ?? ""} options={targetOptions} onChange={(v) => updateBlock(block.id, { next: v || null })} />
              </>
            )}

            {block.type === "assign" && (
              <>
                <select
                  value={block.userId ?? ""}
                  onChange={(e) => updateBlock(block.id, { userId: e.target.value || null })}
                  className="w-full rounded-md border border-gray-300 px-2 py-1.5"
                >
                  <option value="">Unassigned</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name || m.email}
                    </option>
                  ))}
                </select>
                <NextSelect value={block.next ?? ""} options={targetOptions} onChange={(v) => updateBlock(block.id, { next: v || null })} />
              </>
            )}

            {block.type === "handover" && <p className="text-xs text-gray-400">Bot pauses here — a person takes over.</p>}
          </div>
        </div>
      ))}

      <div className="flex flex-wrap gap-2">
        {(Object.keys(BLOCK_LABELS) as BlockType[]).map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => addBlock(type)}
            className="rounded-md border border-dashed border-gray-300 px-2 py-1 text-xs text-gray-600 hover:border-brand hover:text-brand-700"
          >
            + {BLOCK_LABELS[type]}
          </button>
        ))}
      </div>
    </div>
  );
}

function NextSelect({
  value,
  options,
  onChange
}: {
  value: string;
  options: { id: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="rounded-md border border-gray-300 px-2 py-1 text-sm">
      {options.map((o) => (
        <option key={o.id || "end"} value={o.id}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function QuickRepliesFields({
  block,
  targetOptions,
  onChange
}: {
  block: FlowBlock;
  targetOptions: { id: string; label: string }[];
  onChange: (patch: Partial<FlowBlock>) => void;
}) {
  const options = block.options ?? [];

  function updateOption(i: number, patch: Partial<QuickReplyOption>) {
    onChange({ options: options.map((o, idx) => (idx === i ? { ...o, ...patch } : o)) });
  }
  function addOption() {
    if (options.length >= 3) return;
    onChange({ options: [...options, { label: "", next: null }] });
  }
  function removeOption(i: number) {
    onChange({ options: options.filter((_, idx) => idx !== i) });
  }

  return (
    <>
      <textarea
        value={block.body ?? ""}
        onChange={(e) => onChange({ body: e.target.value })}
        placeholder="Message text"
        rows={2}
        className="w-full rounded-md border border-gray-300 px-2 py-1.5"
      />
      {options.map((opt, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            value={opt.label}
            onChange={(e) => updateOption(i, { label: e.target.value })}
            placeholder={`Option ${i + 1}`}
            className="flex-1 rounded-md border border-gray-300 px-2 py-1.5"
          />
          <NextSelect value={opt.next ?? ""} options={targetOptions} onChange={(v) => updateOption(i, { next: v || null })} />
          <button type="button" onClick={() => removeOption(i)} className="text-xs text-red-600">
            ×
          </button>
        </div>
      ))}
      {options.length < 3 && (
        <button type="button" onClick={addOption} className="text-xs text-brand-700">
          + Add option
        </button>
      )}
    </>
  );
}
