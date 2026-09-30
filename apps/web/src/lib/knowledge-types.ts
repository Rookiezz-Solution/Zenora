export type KnowledgeSourceType = "text" | "pdf" | "sheet" | "website";
export type KnowledgeSourceStatus = "pending" | "ready" | "failed";

export interface KnowledgeSource {
  id: string;
  workspaceId: string;
  type: KnowledgeSourceType;
  name: string;
  content: string | null;
  sourceUrl: string | null;
  status: KnowledgeSourceStatus;
  errorMessage: string | null;
  createdAt: string;
}

export interface Faq {
  id: string;
  workspaceId: string;
  question: string;
  answer: string;
  sourceId: string | null;
  usageCount: number;
  createdAt: string;
}

export interface AiSettings {
  tone: string;
  languages: string[];
  answerOnlyFromSources: boolean;
  handoverWhenUnsure: boolean;
  handoverOnDiscountAsked: boolean;
  alwaysEndWithNextStep: boolean;
  replyInLeadsLanguage: boolean;
  sharePricesToggle: boolean;
}

export interface TestChatResult {
  answer: string;
  citedSourceId: string | null;
  citedSourceName: string | null;
  handover: boolean;
  creditsRemaining: number;
}

export interface TestChatMessage {
  role: "user" | "assistant";
  text: string;
  citedSourceName?: string | null;
  handover?: boolean;
}
