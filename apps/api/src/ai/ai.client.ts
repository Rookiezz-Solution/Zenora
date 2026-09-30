import { BadRequestException, Injectable } from "@nestjs/common";
import { loadEnv } from "../config/env";

export interface AiAnswer {
  answer: string;
  citedIndex: number | null; // 1-based index into the context entries passed in
  handover: boolean;
}

export interface GeneratedFaq {
  question: string;
  answer: string;
}

export interface ConversationMessage {
  direction: "inbound" | "outbound";
  body: string;
}

export interface IntentScore {
  bonus: number; // 0-30, added on top of the rule-based score
  reasoning: string;
}

function formatTranscript(messages: ConversationMessage[]): string {
  return messages.map((m) => `${m.direction === "inbound" ? "Customer" : "Business"}: ${m.body}`).join("\n");
}

// Thin wrapper around Anthropic's Messages API. Structurally complete + unit
// tested with mocked responses, like every third-party integration in this
// repo before live keys exist (Razorpay, Meta). Live-verified only as far as
// "fails gracefully without a key" — no ANTHROPIC_API_KEY in this env yet
// (CLAUDE.md: ask before adding a third-party service — done, see docs/
// PROGRESS.md Phase 2 item 1).
@Injectable()
export class AiClient {
  private headers(): Record<string, string> {
    const env = loadEnv();
    if (!env.ANTHROPIC_API_KEY) {
      throw new BadRequestException("AI answers aren't configured yet — set ANTHROPIC_API_KEY");
    }
    return {
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json"
    };
  }

  private async complete(system: string, userMessage: string): Promise<string> {
    const env = loadEnv();
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        model: env.AI_MODEL_VOLUME,
        max_tokens: 800,
        system,
        messages: [{ role: "user", content: userMessage }]
      })
    });
    const body = (await res.json()) as { content?: { text?: string }[] };
    if (!res.ok) {
      throw new Error(`Anthropic request failed: ${JSON.stringify(body)}`);
    }
    const text = body.content?.[0]?.text;
    if (typeof text !== "string") {
      throw new Error("Anthropic response had no text content");
    }
    return text;
  }

  // Answers a lead's question strictly from the cited knowledge-base context
  // (see docs/PRD.md section 9's rules: source-only answers, hand over when
  // unsure or discount asked, always end with a next step, reply in the
  // lead's language, share-prices toggle). Asks the model for strict JSON so
  // the caller can parse `handover`/`citedIndex` mechanically.
  async answerFromKnowledge(params: {
    question: string;
    context: string;
    tone: string;
    languages: string[];
    answerOnlyFromSources: boolean;
    handoverOnDiscountAsked: boolean;
    alwaysEndWithNextStep: boolean;
    replyInLeadsLanguage: boolean;
    sharePricesToggle: boolean;
  }): Promise<AiAnswer> {
    const rules = [
      params.answerOnlyFromSources ? "Only answer using the numbered context sources below — never invent facts." : "Prefer the context sources, but general knowledge is allowed if the context doesn't cover it.",
      params.handoverOnDiscountAsked ? "If the customer asks for a discount or special pricing, set handover=true instead of negotiating." : null,
      params.alwaysEndWithNextStep ? "End every answer with a clear next step for the customer." : null,
      params.replyInLeadsLanguage ? "Reply in the same language the customer's question is written in." : `Reply in one of: ${params.languages.join(", ")}.`,
      params.sharePricesToggle ? "You may share prices from the context sources." : "Never state specific prices — say pricing is discussed with the team instead.",
      "If the context doesn't clearly answer the question, set handover=true and keep the answer brief."
    ].filter(Boolean);

    const system = [
      `You are a ${params.tone} customer-support assistant answering on behalf of a business.`,
      ...rules,
      "Respond with strict JSON only, no markdown fences: " +
        `{"answer": string, "citedIndex": number|null, "handover": boolean}. ` +
        "citedIndex is the [n] number of the single context source your answer relies on most, or null if none.",
      "",
      "Context sources:",
      params.context || "(no sources available)"
    ].join("\n");

    const text = await this.complete(system, params.question);
    return parseAiAnswer(text);
  }

  // Generates candidate FAQs from a source's extracted text — auto-saved by
  // the caller (no review-before-save step in v1, see docs/PROGRESS.md
  // simplification).
  async generateFaqsFromContent(content: string): Promise<GeneratedFaq[]> {
    const system = [
      "You write FAQs for a customer-support knowledge base from source material.",
      "Read the source text and produce up to 8 frequently-asked question/answer pairs a customer might ask, answerable from the text.",
      'Respond with strict JSON only, no markdown fences: {"faqs": [{"question": string, "answer": string}]}.'
    ].join("\n");

    const text = await this.complete(system, content.slice(0, 12000));
    return parseGeneratedFaqs(text);
  }

  // AI intent bonus on top of the rule-based score (docs/PRD.md section 10).
  // Reads recent conversation messages and estimates buying intent/urgency —
  // a small bonus on top of whatever the workspace's condition-based scoring
  // rules already computed.
  async scoreLeadIntent(messages: ConversationMessage[]): Promise<IntentScore> {
    const system = [
      "You score a sales lead's buying intent from their conversation with a business, on top of an existing rule-based score.",
      "Look for signals like urgency, budget mentioned, specific product interest, ready-to-buy language, vs. vague or early-stage browsing.",
      "Respond with strict JSON only, no markdown fences: " +
        '{"bonus": number, "reasoning": string}. bonus is an integer from 0 (no signal) to 30 (strong buying intent). ' +
        "reasoning is one short sentence."
    ].join("\n");

    const text = await this.complete(system, formatTranscript(messages) || "(no messages yet)");
    return parseIntentScore(text);
  }

  // A single suggested reply for a human rep to review and send — never sent
  // automatically (docs/PRD.md section 9's "suggested replies").
  async suggestReply(messages: ConversationMessage[], tone = "friendly"): Promise<string> {
    const system = [
      `You draft a single ${tone}, concise reply for a sales rep to review and send to a customer, based on the conversation so far.`,
      "Reply with the suggested message text only — no preamble, no quotes, no markdown."
    ].join("\n");

    const text = await this.complete(system, formatTranscript(messages) || "(no messages yet)");
    return text.trim();
  }
}

function stripJsonFences(text: string): string {
  return text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
}

function parseAiAnswer(text: string): AiAnswer {
  try {
    const parsed = JSON.parse(stripJsonFences(text));
    return {
      answer: typeof parsed.answer === "string" ? parsed.answer : text,
      citedIndex: typeof parsed.citedIndex === "number" ? parsed.citedIndex : null,
      handover: parsed.handover === true
    };
  } catch {
    // Model didn't return valid JSON — fall back to the raw text so the
    // customer still gets an answer, just without a citation.
    return { answer: text, citedIndex: null, handover: false };
  }
}

function parseIntentScore(text: string): IntentScore {
  try {
    const parsed = JSON.parse(stripJsonFences(text));
    const bonus = typeof parsed.bonus === "number" ? Math.max(0, Math.min(30, Math.round(parsed.bonus))) : 0;
    return { bonus, reasoning: typeof parsed.reasoning === "string" ? parsed.reasoning : "" };
  } catch {
    return { bonus: 0, reasoning: "" };
  }
}

function parseGeneratedFaqs(text: string): GeneratedFaq[] {
  try {
    const parsed = JSON.parse(stripJsonFences(text));
    if (!Array.isArray(parsed.faqs)) return [];
    return parsed.faqs.filter(
      (f: unknown): f is GeneratedFaq =>
        typeof f === "object" && f !== null && typeof (f as GeneratedFaq).question === "string" && typeof (f as GeneratedFaq).answer === "string"
    );
  } catch {
    return [];
  }
}
