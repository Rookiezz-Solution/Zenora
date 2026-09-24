"use client";

import { useState } from "react";
import type { CustomField } from "@/lib/pipeline-types";

// docs/PRD.md: "Moving to a stage with required fields opens a form."
export function MoveStageForm({
  stageName,
  fields,
  onCancel,
  onSubmit
}: {
  stageName: string;
  fields: CustomField[];
  onCancel: () => void;
  onSubmit: (values: Record<string, string>) => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl">
        <h2 className="text-sm font-semibold text-gray-900">Moving to &quot;{stageName}&quot;</h2>
        <p className="mt-1 text-xs text-gray-500">These fields are required for this stage.</p>

        <div className="mt-4 space-y-3">
          {fields.map((field) => (
            <label key={field.id} className="flex flex-col gap-1 text-sm">
              {field.label}
              {field.type === "select" && field.options ? (
                <select
                  value={values[field.id] ?? ""}
                  onChange={(e) => setValues({ ...values, [field.id]: e.target.value })}
                  className="rounded-md border border-gray-300 px-2 py-1.5"
                >
                  <option value="">Choose…</option>
                  {field.options.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
                  value={values[field.id] ?? ""}
                  onChange={(e) => setValues({ ...values, [field.id]: e.target.value })}
                  className="rounded-md border border-gray-300 px-2 py-1.5"
                />
              )}
            </label>
          ))}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-md border border-gray-300 px-3 py-1.5 text-sm">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onSubmit(values)}
            className="rounded-md bg-brand px-3 py-1.5 text-sm font-semibold text-white"
          >
            Move
          </button>
        </div>
      </div>
    </div>
  );
}
