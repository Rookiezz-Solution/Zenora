import type { FlowBlock, FlowGraph } from "./automation";

// Replaces `{business_name}`-style placeholders in a template's message
// text when it's turned into a real automation (docs/PRD.md: "template
// editor with fill-in variables {business_name}"). Only touches the text a
// lead would actually see — block wiring (next/ifTrue/tagName/stageId/...)
// is left untouched.
export function substituteTemplateVariables(graph: FlowGraph, variables: Record<string, string>): FlowGraph {
  function fill(text: string): string {
    return text.replace(/\{(\w+)\}/g, (match, key: string) => variables[key] ?? match);
  }

  function fillBlock(block: FlowBlock): FlowBlock {
    switch (block.type) {
      case "send_text":
        return { ...block, body: fill(block.body) };
      case "send_quick_replies":
        return { ...block, body: fill(block.body), options: block.options.map((o) => ({ ...o, label: fill(o.label) })) };
      default:
        return block;
    }
  }

  return {
    startBlockId: graph.startBlockId,
    blocks: Object.fromEntries(Object.entries(graph.blocks).map(([id, block]) => [id, fillBlock(block)]))
  };
}

// Scans a graph's message text for `{variable}` placeholders so the
// template editor can show which ones exist without the author having to
// list them by hand.
export function extractTemplateVariables(graph: FlowGraph): string[] {
  const found = new Set<string>();
  for (const block of Object.values(graph.blocks)) {
    const texts: string[] =
      block.type === "send_text"
        ? [block.body]
        : block.type === "send_quick_replies"
          ? [block.body, ...block.options.map((o) => o.label)]
          : [];
    for (const text of texts) {
      for (const match of text.matchAll(/\{(\w+)\}/g)) {
        found.add(match[1]!);
      }
    }
  }
  return [...found];
}
