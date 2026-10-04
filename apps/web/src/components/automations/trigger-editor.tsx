"use client";

import { useState } from "react";
import type { CustomField } from "@/lib/pipeline-types";
import {
  TRIGGER_LABELS,
  fromStored,
  isEventTrigger,
  type ConditionMode,
  type KeywordMatch,
  type SavedTrigger,
  type TriggerCondition,
  type TriggerDefinition,
  type TriggerKind
} from "@/lib/trigger-definition";

const EMPTY_CONDITION: TriggerCondition = { field: "source", operator: "equals", value: "" };

export function TriggerEditor({
  value,
  onChange,
  customFields,
  stages,
  savedTriggers,
  onSave,
  onSaveAs,
  onDeleteSaved
}: {
  value: TriggerDefinition;
  onChange: (next: TriggerDefinition) => void;
  customFields: CustomField[];
  stages: { id: string; name: string }[];
  savedTriggers: SavedTrigger[];
  onSave: () => void;
  onSaveAs: (name: string) => void;
  onDeleteSaved: (id: string) => void;
}) {
  const [savedName, setSavedName] = useState("");
  const [pickedSavedId, setPickedSavedId] = useState("");
  const isKeyword = !isEventTrigger(value.type);

  function patch(partial: Partial<TriggerDefinition>) {
    onChange({ ...value, ...partial });
  }

  function patchCondition(index: number, partial: Partial<TriggerCondition>) {
    patch({ conditions: value.conditions.map((c, i) => (i === index ? { ...c, ...partial } : c)) });
  }

  return (
    <div className="space-y-4">
      {savedTriggers.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-xs text-gray-500">My triggers</span>
          <select
            value={pickedSavedId}
            onChange={(e) => setPickedSavedId(e.target.value)}
            className="rounded-md border border-gray-300 px-2 py-1 text-xs"
          >
            <option value="">Load a saved trigger…</option>
            {savedTriggers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!pickedSavedId}
            onClick={() => {
              const saved = savedTriggers.find((s) => s.id === pickedSavedId);
              if (saved) onChange(fromStored(saved.type, saved.config));
            }}
            className="rounded-md border border-gray-300 px-2 py-1 text-xs disabled:opacity-50"
          >
            Load
          </button>
          <button
            type="button"
            disabled={!pickedSavedId}
            onClick={() => {
              onDeleteSaved(pickedSavedId);
              setPickedSavedId("");
            }}
            className="text-xs text-red-600 disabled:opacity-50"
          >
            Delete
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-gray-600">When</span>
        <select
          value={value.type}
          onChange={(e) => patch({ type: e.target.value as TriggerKind })}
          className="rounded-md border border-gray-300 px-2 py-1.5"
        >
          {(Object.keys(TRIGGER_LABELS) as TriggerKind[]).map((k) => (
            <option key={k} value={k}>
              {TRIGGER_LABELS[k]}
            </option>
          ))}
        </select>

        {isKeyword ? (
          <>
            contains
            <input
              value={value.keywords}
              onChange={(e) => patch({ keywords: e.target.value })}
              placeholder="keyword1, keyword2"
              className="flex-1 rounded-md border border-gray-300 px-2 py-1.5"
            />
            <select
              value={value.matchType}
              onChange={(e) => patch({ matchType: e.target.value as KeywordMatch })}
              className="rounded-md border border-gray-300 px-2 py-1.5"
            >
              <option value="contains">contains</option>
              <option value="exact">exact match</option>
              <option value="any">any message</option>
            </select>
          </>
        ) : value.type === "stage_changed" ? (
          <select value={value.stageId} onChange={(e) => patch({ stageId: e.target.value })} className="rounded-md border border-gray-300 px-2 py-1.5">
            <option value="">any stage</option>
            {stages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        ) : value.type === "score_reached" ? (
          <>
            <input
              type="number"
              min={1}
              max={1000}
              value={value.scoreThreshold}
              onChange={(e) => patch({ scoreThreshold: e.target.value })}
              className="w-24 rounded-md border border-gray-300 px-2 py-1.5"
            />
            <span className="text-xs text-gray-500">points (starts once, when the score rises to this level)</span>
          </>
        ) : (
          <input
            value={value.tagName}
            onChange={(e) => patch({ tagName: e.target.value })}
            placeholder="tag name (leave empty for any tag)"
            className="flex-1 rounded-md border border-gray-300 px-2 py-1.5"
          />
        )}
      </div>

      <div>
        <p className="flex flex-wrap items-center gap-1 text-xs font-medium text-gray-700">
          Only if
          <select value={value.conditionMode} onChange={(e) => patch({ conditionMode: e.target.value as ConditionMode })} className="rounded-md border border-gray-300 px-1 py-0.5 text-xs">
            <option value="all">all</option>
            <option value="any">any one</option>
          </select>
          of these match the lead
        </p>
        <div className="mt-1 space-y-2">
          {value.conditions.map((c, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <select
                value={c.field}
                onChange={(e) => patchCondition(i, { field: e.target.value as TriggerCondition["field"], fieldId: undefined })}
                className="rounded-md border border-gray-300 px-2 py-1 text-xs"
              >
                <option value="source">Source</option>
                <option value="tag">Tag</option>
                <option value="customField">Custom field</option>
              </select>
              {c.field === "customField" && (
                <select
                  value={c.fieldId ?? ""}
                  onChange={(e) => patchCondition(i, { fieldId: e.target.value })}
                  className="rounded-md border border-gray-300 px-2 py-1 text-xs"
                >
                  <option value="">Pick a field…</option>
                  {customFields.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.label}
                    </option>
                  ))}
                </select>
              )}
              <select
                value={c.operator}
                onChange={(e) => patchCondition(i, { operator: e.target.value as TriggerCondition["operator"] })}
                className="rounded-md border border-gray-300 px-2 py-1 text-xs"
              >
                <option value="equals">equals</option>
                <option value="contains">contains</option>
              </select>
              <input
                value={c.value}
                onChange={(e) => patchCondition(i, { value: e.target.value })}
                placeholder="value"
                className="w-32 rounded-md border border-gray-300 px-2 py-1 text-xs"
              />
              <button
                type="button"
                onClick={() => patch({ conditions: value.conditions.filter((_, j) => j !== i) })}
                className="text-xs text-red-600"
              >
                Remove
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => patch({ conditions: [...value.conditions, EMPTY_CONDITION] })}
            className="text-xs text-brand-700"
          >
            + Add condition
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 text-sm">
        <label className="flex items-center gap-1 text-xs text-gray-600">
          <input type="checkbox" checked={value.onceForLead} onChange={(e) => patch({ onceForLead: e.target.checked })} />
          Only once per lead (never re-run, even after it finishes)
        </label>
        <label className="flex items-center gap-1 text-xs text-gray-600">
          Delay
          <input
            type="number"
            min={1}
            value={value.delayMinutes}
            onChange={(e) => patch({ delayMinutes: e.target.value })}
            placeholder="0"
            className="w-16 rounded-md border border-gray-300 px-2 py-1"
          />
          minutes before the flow starts
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={onSave} className="rounded-md bg-gray-800 px-3 py-1.5 text-sm font-semibold text-white">
          Save trigger
        </button>
        <input
          value={savedName}
          onChange={(e) => setSavedName(e.target.value)}
          placeholder="Name to save under My triggers"
          className="w-56 rounded-md border border-gray-300 px-2 py-1.5 text-xs"
        />
        <button
          type="button"
          disabled={!savedName.trim()}
          onClick={() => {
            onSaveAs(savedName.trim());
            setSavedName("");
          }}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-xs disabled:opacity-50"
        >
          Save to My triggers
        </button>
      </div>
    </div>
  );
}
