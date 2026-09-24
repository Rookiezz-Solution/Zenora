import { describe, expect, it } from "vitest";
import type { FlowGraph } from "./automation";
import { validateFlowGraph } from "./automation-validation";

describe("validateFlowGraph", () => {
  it("passes a well-formed linear graph", () => {
    const graph: FlowGraph = {
      startBlockId: "a",
      blocks: {
        a: { id: "a", type: "send_text", body: "hi", next: "b" },
        b: { id: "b", type: "tag", tagName: "warm", next: null }
      }
    };
    expect(validateFlowGraph(graph)).toEqual([]);
  });

  it("flags a start block that doesn't exist", () => {
    const graph: FlowGraph = { startBlockId: "missing", blocks: {} };
    expect(validateFlowGraph(graph)).toContainEqual(
      expect.objectContaining({ blockId: "missing" })
    );
  });

  it("flags a dangling next reference", () => {
    const graph: FlowGraph = {
      startBlockId: "a",
      blocks: { a: { id: "a", type: "send_text", body: "hi", next: "nowhere" } }
    };
    const issues = validateFlowGraph(graph);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.message).toMatch(/next/);
  });

  it("flags dangling condition branches independently", () => {
    const graph: FlowGraph = {
      startBlockId: "a",
      blocks: {
        a: { id: "a", type: "condition", field: "tag", operator: "equals", value: "vip", ifTrue: "missing1", ifFalse: "missing2" }
      }
    };
    const issues = validateFlowGraph(graph);
    expect(issues).toHaveLength(2);
  });

  it("rejects more than 3 quick-reply options", () => {
    const graph: FlowGraph = {
      startBlockId: "a",
      blocks: {
        a: {
          id: "a",
          type: "send_quick_replies",
          body: "Pick one",
          options: [
            { label: "1", next: null },
            { label: "2", next: null },
            { label: "3", next: null },
            { label: "4", next: null }
          ]
        }
      }
    };
    expect(validateFlowGraph(graph)).toContainEqual(expect.objectContaining({ message: expect.stringContaining("limited to 3") }));
  });

  it("requires at least one quick-reply option", () => {
    const graph: FlowGraph = {
      startBlockId: "a",
      blocks: { a: { id: "a", type: "send_quick_replies", body: "Pick one", options: [] } }
    };
    expect(validateFlowGraph(graph)).toContainEqual(expect.objectContaining({ message: expect.stringContaining("at least one") }));
  });

  it("treats a handover block as a valid terminal with no outgoing reference to check", () => {
    const graph: FlowGraph = {
      startBlockId: "a",
      blocks: { a: { id: "a", type: "handover" } }
    };
    expect(validateFlowGraph(graph)).toEqual([]);
  });
});
