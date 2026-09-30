import { BadRequestException } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AiClient } from "./ai.client";

const ORIGINAL_ENV = { ...process.env };

function mockAnthropicResponse(text: string) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ content: [{ text }] })
    })
  );
}

describe("AiClient", () => {
  beforeEach(() => {
    process.env = {
      ...ORIGINAL_ENV,
      DATABASE_URL: "postgresql://x",
      AUTH_SECRET: "a".repeat(32),
      TOKEN_ENCRYPTION_KEY: "a".repeat(64),
      ANTHROPIC_API_KEY: "sk-test"
    };
    vi.resetModules();
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
    vi.unstubAllGlobals();
  });

  it("throws a clear, non-500 error when ANTHROPIC_API_KEY is missing", async () => {
    process.env.ANTHROPIC_API_KEY = "";
    const { AiClient: FreshAiClient } = await import("./ai.client");
    const client = new FreshAiClient();

    await expect(
      client.answerFromKnowledge({
        question: "q",
        context: "",
        tone: "friendly",
        languages: ["en"],
        answerOnlyFromSources: true,
        handoverOnDiscountAsked: true,
        alwaysEndWithNextStep: true,
        replyInLeadsLanguage: true,
        sharePricesToggle: false
      })
    ).rejects.toThrow(BadRequestException);
  });

  it("parses a well-formed JSON answer from the model", async () => {
    mockAnthropicResponse(JSON.stringify({ answer: "Returns are free within 7 days.", citedIndex: 1, handover: false }));
    const client = new AiClient();

    const result = await client.answerFromKnowledge({
      question: "What's your return policy?",
      context: "[1] Refund policy\nReturns within 7 days.",
      tone: "friendly",
      languages: ["en"],
      answerOnlyFromSources: true,
      handoverOnDiscountAsked: true,
      alwaysEndWithNextStep: true,
      replyInLeadsLanguage: true,
      sharePricesToggle: false
    });

    expect(result).toEqual({ answer: "Returns are free within 7 days.", citedIndex: 1, handover: false });
  });

  it("strips markdown code fences before parsing", async () => {
    mockAnthropicResponse('```json\n{"answer": "Hi", "citedIndex": null, "handover": true}\n```');
    const client = new AiClient();

    const result = await client.answerFromKnowledge({
      question: "q",
      context: "",
      tone: "friendly",
      languages: ["en"],
      answerOnlyFromSources: true,
      handoverOnDiscountAsked: true,
      alwaysEndWithNextStep: true,
      replyInLeadsLanguage: true,
      sharePricesToggle: false
    });

    expect(result).toEqual({ answer: "Hi", citedIndex: null, handover: true });
  });

  it("falls back to the raw text with handover=false when the model doesn't return JSON", async () => {
    mockAnthropicResponse("Sorry, I'm not sure about that.");
    const client = new AiClient();

    const result = await client.answerFromKnowledge({
      question: "q",
      context: "",
      tone: "friendly",
      languages: ["en"],
      answerOnlyFromSources: true,
      handoverOnDiscountAsked: true,
      alwaysEndWithNextStep: true,
      replyInLeadsLanguage: true,
      sharePricesToggle: false
    });

    expect(result).toEqual({ answer: "Sorry, I'm not sure about that.", citedIndex: null, handover: false });
  });

  it("generates and parses FAQs from source content", async () => {
    mockAnthropicResponse(
      JSON.stringify({ faqs: [{ question: "Do you ship internationally?", answer: "No, India only." }] })
    );
    const client = new AiClient();

    const result = await client.generateFaqsFromContent("We ship across India via courier partners.");

    expect(result).toEqual([{ question: "Do you ship internationally?", answer: "No, India only." }]);
  });

  it("returns an empty array when FAQ generation doesn't return valid JSON", async () => {
    mockAnthropicResponse("I couldn't generate FAQs.");
    const client = new AiClient();

    const result = await client.generateFaqsFromContent("some content");

    expect(result).toEqual([]);
  });

  it("throws when Anthropic returns a non-OK response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, json: () => Promise.resolve({ error: "rate_limited" }) })
    );
    const client = new AiClient();

    await expect(
      client.answerFromKnowledge({
        question: "q",
        context: "",
        tone: "friendly",
        languages: ["en"],
        answerOnlyFromSources: true,
        handoverOnDiscountAsked: true,
        alwaysEndWithNextStep: true,
        replyInLeadsLanguage: true,
        sharePricesToggle: false
      })
    ).rejects.toThrow("Anthropic request failed");
  });
});
