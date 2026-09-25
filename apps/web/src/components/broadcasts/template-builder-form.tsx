"use client";

import { useState } from "react";
import type { ButtonType, HeaderType, TemplateButton, TemplateCategory } from "@/lib/broadcast-types";

export interface TemplateFormValues {
  name: string;
  category: TemplateCategory;
  language: string;
  headerType: HeaderType;
  headerText: string;
  bodyText: string;
  footerText: string;
  buttons: TemplateButton[];
}

const EMPTY_BUTTON: TemplateButton = { type: "quick_reply", text: "" };

export function TemplateBuilderForm({
  initial,
  nameLocked,
  onSubmit,
  submitLabel
}: {
  initial: TemplateFormValues;
  nameLocked: boolean;
  onSubmit: (values: TemplateFormValues) => Promise<void>;
  submitLabel: string;
}) {
  const [values, setValues] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function set<K extends keyof TemplateFormValues>(key: K, value: TemplateFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  function addButton() {
    if (values.buttons.length >= 10) return;
    set("buttons", [...values.buttons, { ...EMPTY_BUTTON }]);
  }

  function updateButton(index: number, patch: Partial<TemplateButton>) {
    set(
      "buttons",
      values.buttons.map((b, i) => (i === index ? { ...b, ...patch } : b))
    );
  }

  function removeButton(index: number) {
    set(
      "buttons",
      values.buttons.filter((_, i) => i !== index)
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await onSubmit(values);
    } catch (err) {
      setError((err as { message?: string }).message ?? "Could not save template");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-md border border-gray-200 bg-white p-4">
      <label className="block text-sm">
        <span className="text-gray-500">
          Name {nameLocked && <span className="text-xs text-gray-400">(locked — Meta doesn&apos;t allow renaming)</span>}
        </span>
        <input
          value={values.name}
          disabled={nameLocked}
          onChange={(e) => set("name", e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))}
          placeholder="order_confirmation"
          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-50 disabled:text-gray-500"
        />
        <span className="mt-1 block text-xs text-gray-400">Lowercase snake_case only, e.g. order_confirmation.</span>
      </label>

      <div className="flex gap-3">
        <label className="flex-1 text-sm">
          <span className="text-gray-500">Category</span>
          <select
            value={values.category}
            onChange={(e) => set("category", e.target.value as TemplateCategory)}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="marketing">Marketing</option>
            <option value="utility">Utility</option>
            <option value="authentication">Authentication</option>
          </select>
        </label>
        <label className="flex-1 text-sm">
          <span className="text-gray-500">Language</span>
          <input
            value={values.language}
            onChange={(e) => set("language", e.target.value)}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </label>
      </div>

      <div className="flex gap-3">
        <label className="flex-1 text-sm">
          <span className="text-gray-500">Header</span>
          <select
            value={values.headerType}
            onChange={(e) => set("headerType", e.target.value as HeaderType)}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="none">None</option>
            <option value="text">Text</option>
            <option value="image">Image</option>
            <option value="video">Video</option>
            <option value="document">Document</option>
          </select>
        </label>
        {values.headerType === "text" && (
          <label className="flex-1 text-sm">
            <span className="text-gray-500">Header text</span>
            <input
              value={values.headerText}
              maxLength={60}
              onChange={(e) => set("headerText", e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
        )}
      </div>

      <label className="block text-sm">
        <span className="text-gray-500">Body</span>
        <textarea
          value={values.bodyText}
          maxLength={1024}
          rows={4}
          onChange={(e) => set("bodyText", e.target.value)}
          placeholder="Hi {{1}}, your order is on its way!"
          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
      </label>

      <label className="block text-sm">
        <span className="text-gray-500">Footer (optional)</span>
        <input
          value={values.footerText}
          maxLength={60}
          onChange={(e) => set("footerText", e.target.value)}
          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
      </label>

      <div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-500">Buttons (optional)</span>
          <button type="button" onClick={addButton} className="text-xs font-medium text-brand-700">
            + Add button
          </button>
        </div>
        <div className="mt-2 space-y-2">
          {values.buttons.map((b, i) => (
            <div key={i} className="flex items-center gap-2">
              <select
                value={b.type}
                onChange={(e) => updateButton(i, { type: e.target.value as ButtonType })}
                className="rounded-md border border-gray-300 px-2 py-1.5 text-xs"
              >
                <option value="quick_reply">Quick reply</option>
                <option value="url">URL</option>
                <option value="phone_number">Call phone</option>
              </select>
              <input
                value={b.text}
                maxLength={25}
                onChange={(e) => updateButton(i, { text: e.target.value })}
                placeholder="Button text"
                className="flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-xs"
              />
              {b.type === "url" && (
                <input
                  value={b.url ?? ""}
                  onChange={(e) => updateButton(i, { url: e.target.value })}
                  placeholder="https://…"
                  className="flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-xs"
                />
              )}
              {b.type === "phone_number" && (
                <input
                  value={b.phoneNumber ?? ""}
                  onChange={(e) => updateButton(i, { phoneNumber: e.target.value })}
                  placeholder="+91…"
                  className="flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-xs"
                />
              )}
              <button type="button" onClick={() => removeButton(i)} className="text-xs text-red-600">
                Remove
              </button>
            </div>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <button type="submit" disabled={saving} className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
        {saving ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}
