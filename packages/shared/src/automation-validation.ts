import type { FlowGraph } from "./automation";

export interface GraphValidationIssue {
  blockId: string;
  message: string;
}

// Structural checks only (dangling references, block-shape limits) — the
// Meta policy checks docs/PRD.md mentions (24h window, template category,
// comment reply limits) are enforced at send time by the engine/inbox
// service, not here, since they depend on runtime state a static graph
// can't know.
export function validateFlowGraph(graph: FlowGraph): GraphValidationIssue[] {
  const issues: GraphValidationIssue[] = [];
  const ids = new Set(Object.keys(graph.blocks));

  function checkRef(blockId: string, ref: string | null, label: string) {
    if (ref !== null && !ids.has(ref)) {
      issues.push({ blockId, message: `"${label}" points to a block that doesn't exist` });
    }
  }

  if (!ids.has(graph.startBlockId)) {
    issues.push({ blockId: graph.startBlockId, message: "Start block doesn't exist in the graph" });
  }

  for (const [id, block] of Object.entries(graph.blocks)) {
    switch (block.type) {
      case "send_text":
      case "wait":
      case "tag":
      case "move_stage":
      case "assign":
        checkRef(id, block.next, "next");
        break;
      case "send_quick_replies":
        if (block.options.length === 0) issues.push({ blockId: id, message: "Needs at least one option" });
        if (block.options.length > 3) issues.push({ blockId: id, message: "Reply buttons are limited to 3" });
        block.options.forEach((opt) => checkRef(id, opt.next, `option "${opt.label}"`));
        break;
      case "condition":
        checkRef(id, block.ifTrue, "ifTrue");
        checkRef(id, block.ifFalse, "ifFalse");
        break;
      case "handover":
        break;
    }
  }

  return issues;
}
