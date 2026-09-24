import { describe, expect, it } from "vitest";
import type { FlowGraph } from "./automation";
import { extractTemplateVariables, substituteTemplateVariables } from "./automation-template";

describe("substituteTemplateVariables", () => {
  it("fills a known placeholder in a send_text block", () => {
    const graph: FlowGraph = {
      startBlockId: "a",
      blocks: { a: { id: "a", type: "send_text", body: "Welcome to {business_name}!", next: null } }
    };
    const result = substituteTemplateVariables(graph, { business_name: "Acme Coaching" });
    expect((result.blocks.a as { body: string }).body).toBe("Welcome to Acme Coaching!");
  });

  it("leaves an unknown placeholder untouched instead of blanking it", () => {
    const graph: FlowGraph = {
      startBlockId: "a",
      blocks: { a: { id: "a", type: "send_text", body: "Hi {first_name}, welcome to {business_name}!", next: null } }
    };
    const result = substituteTemplateVariables(graph, { business_name: "Acme" });
    expect((result.blocks.a as { body: string }).body).toBe("Hi {first_name}, welcome to Acme!");
  });

  it("fills placeholders in quick-reply body and option labels", () => {
    const graph: FlowGraph = {
      startBlockId: "a",
      blocks: {
        a: {
          id: "a",
          type: "send_quick_replies",
          body: "How can {business_name} help?",
          options: [{ label: "Book with {business_name}", next: null }]
        }
      }
    };
    const result = substituteTemplateVariables(graph, { business_name: "Zen Clinic" });
    const block = result.blocks.a as { body: string; options: { label: string }[] };
    expect(block.body).toBe("How can Zen Clinic help?");
    expect(block.options[0]?.label).toBe("Book with Zen Clinic");
  });

  it("leaves non-text blocks (and their wiring) untouched", () => {
    const graph: FlowGraph = {
      startBlockId: "a",
      blocks: { a: { id: "a", type: "tag", tagName: "{business_name}", next: "b" }, b: { id: "b", type: "handover" } }
    };
    const result = substituteTemplateVariables(graph, { business_name: "Acme" });
    expect(result.blocks.a).toEqual(graph.blocks.a); // tagName is not message text, left as-is
    expect(result.startBlockId).toBe("a");
  });
});

describe("extractTemplateVariables", () => {
  it("finds every distinct placeholder used across the graph", () => {
    const graph: FlowGraph = {
      startBlockId: "a",
      blocks: {
        a: { id: "a", type: "send_text", body: "Hi {first_name}, welcome to {business_name}!", next: "b" },
        b: { id: "b", type: "send_quick_replies", body: "From {business_name}", options: [{ label: "{cta_label}", next: null }] }
      }
    };
    expect(extractTemplateVariables(graph).sort()).toEqual(["business_name", "cta_label", "first_name"]);
  });

  it("returns an empty list when there are no placeholders", () => {
    const graph: FlowGraph = { startBlockId: "a", blocks: { a: { id: "a", type: "handover" } } };
    expect(extractTemplateVariables(graph)).toEqual([]);
  });
});
