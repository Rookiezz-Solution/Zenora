"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useCurrentWorkspace } from "@/lib/use-workspace";

interface Results {
  query: string;
  leads: { id: string; name: string | null; phone: string | null; email: string | null }[];
  automations: { id: string; name: string; status: string }[];
  flowTemplates: { id: string; name: string }[];
  tasks: { id: string; title: string; leadId: string | null; completedAt: string | null }[];
  notes: { id: string; leadId: string; leadName: string | null; excerpt: string }[];
}

interface Item {
  key: string;
  group: string;
  title: string;
  detail?: string;
  href: string;
}

function flatten(r: Results | null): Item[] {
  if (!r) return [];
  return [
    ...r.leads.map((l) => ({ key: `l${l.id}`, group: "Contacts", title: l.name ?? l.phone ?? l.email ?? "Unnamed", detail: [l.phone, l.email].filter(Boolean).join(" · "), href: `/leads/${l.id}` })),
    ...r.notes.map((n) => ({ key: `n${n.id}`, group: "Notes", title: n.leadName ?? "Contact", detail: n.excerpt, href: `/leads/${n.leadId}` })),
    ...r.tasks.map((t) => ({ key: `t${t.id}`, group: "Tasks", title: t.title, detail: t.completedAt ? "done" : "open", href: "/tasks" })),
    ...r.automations.map((a) => ({ key: `a${a.id}`, group: "Automations", title: a.name, detail: a.status, href: `/automations/${a.id}` })),
    ...r.flowTemplates.map((f) => ({ key: `f${f.id}`, group: "Flow templates", title: f.name, href: `/automations/templates/${f.id}` }))
  ];
}

// The sidebar's search box, opened by clicking it or pressing Ctrl K / Cmd K
// anywhere in the app.
export function SearchTrigger() {
  const router = useRouter();
  const { workspaceId } = useCurrentWorkspace();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Results | null>(null);
  const [active, setActive] = useState(0);
  const [failed, setFailed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setResults(null);
    setActive(0);
    setFailed(false);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "Escape") close();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Debounced; a slow earlier answer never overwrites a newer one.
  useEffect(() => {
    if (!open || !workspaceId) return;
    const q = query.trim();
    if (q.length < 2) {
      setResults(null);
      return;
    }
    let stale = false;
    const timer = setTimeout(() => {
      apiFetch<Results>(`/search/${workspaceId}?q=${encodeURIComponent(q)}`)
        .then((r) => {
          if (stale) return;
          setResults(r);
          setActive(0);
          setFailed(false);
        })
        .catch(() => !stale && setFailed(true));
    }, 200);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [query, open, workspaceId]);

  const items = flatten(results);

  function go(item: Item | undefined) {
    if (!item) return;
    close();
    router.push(item.href);
  }

  function onInputKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(items.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter") go(items[active]);
  }

  let lastGroup = "";
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="mx-3 mt-3 flex items-center justify-between rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-500 hover:border-gray-300">
        <span>Search leads, chats, automations</span>
        <kbd className="rounded border border-gray-300 bg-gray-50 px-1.5 py-0.5 text-xs">Ctrl K</kbd>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 px-4 pt-24" onMouseDown={close}>
          <div className="w-full max-w-xl overflow-hidden rounded-lg bg-white shadow-xl" role="dialog" aria-label="Search" onMouseDown={(e) => e.stopPropagation()}>
            <input ref={inputRef} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onInputKey} placeholder="Search contacts, notes, tasks, automations…" className="w-full border-b border-gray-200 px-4 py-3 text-sm outline-none" />
            <div className="max-h-96 overflow-y-auto py-1">
              {query.trim().length < 2 && <p className="px-4 py-6 text-center text-sm text-gray-400">Type at least two characters. A phone number works with or without spaces.</p>}
              {failed && <p className="px-4 py-6 text-center text-sm text-red-600">Search is unavailable right now.</p>}
              {results && !failed && items.length === 0 && <p className="px-4 py-6 text-center text-sm text-gray-400">Nothing found for &ldquo;{results.query}&rdquo;.</p>}
              {items.map((item, i) => {
                const header = item.group !== lastGroup;
                lastGroup = item.group;
                return (
                  <div key={item.key}>
                    {header && <p className="px-4 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">{item.group}</p>}
                    <button type="button" onMouseEnter={() => setActive(i)} onClick={() => go(item)} className={`block w-full px-4 py-2 text-left text-sm ${i === active ? "bg-brand-50" : ""}`}>
                      <span className="font-medium text-gray-900">{item.title}</span>
                      {item.detail && <span className="ml-2 text-xs text-gray-500">{item.detail}</span>}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
