import { describe, expect, it } from "vitest";
import { buildKnowledgeContext, chunkText, extractTextFromHtml, rankChunksByKeywords } from "./knowledge";

describe("chunkText", () => {
  it("splits on blank lines into paragraph chunks", () => {
    const result = chunkText("First paragraph.\n\nSecond paragraph.");
    expect(result).toEqual(["First paragraph.", "Second paragraph."]);
  });

  it("hard-wraps a paragraph longer than the max chunk size", () => {
    const long = "a".repeat(2500);
    const result = chunkText(long);
    expect(result).toHaveLength(3);
    expect(result[0]).toHaveLength(1000);
    expect(result[2]).toHaveLength(500);
  });

  it("returns an empty array for blank content", () => {
    expect(chunkText("   \n\n  ")).toEqual([]);
  });
});

describe("extractTextFromHtml", () => {
  it("strips tags, scripts and styles and decodes entities", () => {
    const html = "<html><head><style>.a{}</style></head><body><script>evil()</script><p>Hello &amp; welcome</p></body></html>";
    const result = extractTextFromHtml(html);
    expect(result).toBe("Hello & welcome");
  });
});

describe("rankChunksByKeywords", () => {
  const chunks = [
    { id: "1", content: "Our refund policy allows returns within 7 days." },
    { id: "2", content: "We ship pan-India via trusted courier partners." },
    { id: "3", content: "Refunds are processed within 3 business days after return pickup." }
  ];

  it("ranks chunks containing more query keywords higher", () => {
    const result = rankChunksByKeywords(chunks, "refund policy days", 2);
    expect(result.map((c) => c.id)).toEqual(["1", "3"]);
  });

  it("excludes chunks with no keyword overlap", () => {
    const result = rankChunksByKeywords(chunks, "shipping courier", 5);
    expect(result.map((c) => c.id)).toEqual(["2"]);
  });
});

describe("buildKnowledgeContext", () => {
  it("numbers entries as citable [n] markers", () => {
    const result = buildKnowledgeContext([
      { id: "a", label: "Refund policy", content: "Returns within 7 days." },
      { id: "b", label: "FAQ: Shipping", content: "Ships pan-India." }
    ]);
    expect(result).toBe("[1] Refund policy\nReturns within 7 days.\n\n[2] FAQ: Shipping\nShips pan-India.");
  });
});
