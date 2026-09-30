import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { buildKnowledgeContext, chunkText, rankChunksByKeywords } from "@zenora/shared";
import { AiClient } from "../ai/ai.client";
import { UsageService } from "../billing/usage.service";
import { PrismaService } from "../prisma/prisma.service";
import { QueueService } from "../queue/queue.service";
import type {
  CreateFaqDto,
  CreateKnowledgeSourceDto,
  GenerateFaqsDto,
  TestChatDto,
  UpdateAiSettingsDto,
  UpdateFaqDto,
  UpdateKnowledgeSourceDto
} from "./dto/knowledge.dto";

const DEFAULT_AI_SETTINGS = {
  tone: "friendly",
  languages: ["en"],
  answerOnlyFromSources: true,
  handoverWhenUnsure: true,
  handoverOnDiscountAsked: true,
  alwaysEndWithNextStep: true,
  replyInLeadsLanguage: true,
  sharePricesToggle: false
};

interface RankableEntry {
  id: string;
  kind: "chunk" | "faq";
  sourceId: string | null;
  label: string;
  content: string;
}

@Injectable()
export class KnowledgeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiClient,
    private readonly usage: UsageService,
    private readonly queue: QueueService
  ) {}

  listSources(workspaceId: string) {
    return this.prisma.client.knowledgeSource.findMany({ where: { workspaceId }, orderBy: { createdAt: "desc" } });
  }

  async createSource(workspaceId: string, dto: CreateKnowledgeSourceDto) {
    if (dto.type === "website") {
      const source = await this.prisma.client.knowledgeSource.create({
        data: { workspaceId, type: dto.type, name: dto.name, sourceUrl: dto.sourceUrl, status: "pending" }
      });
      await this.queue.add("ai", "process_knowledge_source", { sourceId: source.id });
      return source;
    }

    const source = await this.prisma.client.knowledgeSource.create({
      data: { workspaceId, type: dto.type, name: dto.name, content: dto.content, status: "ready" }
    });
    await this.rebuildChunks(source.id, workspaceId, dto.content ?? "");
    return source;
  }

  async updateSource(workspaceId: string, id: string, dto: UpdateKnowledgeSourceDto) {
    const existing = await this.prisma.client.knowledgeSource.findFirst({ where: { id, workspaceId } });
    if (!existing) throw new NotFoundException("Knowledge source not found");

    if (existing.type === "website" && dto.sourceUrl !== undefined) {
      await this.prisma.client.knowledgeSource.update({
        where: { id },
        data: { name: dto.name ?? existing.name, sourceUrl: dto.sourceUrl, status: "pending", errorMessage: null }
      });
      await this.queue.add("ai", "process_knowledge_source", { sourceId: id });
    } else if (dto.content !== undefined) {
      await this.prisma.client.knowledgeSource.update({
        where: { id },
        data: { name: dto.name ?? existing.name, content: dto.content, status: "ready", errorMessage: null }
      });
      await this.rebuildChunks(id, workspaceId, dto.content);
    } else if (dto.name !== undefined) {
      await this.prisma.client.knowledgeSource.update({ where: { id }, data: { name: dto.name } });
    }

    return this.prisma.client.knowledgeSource.findUniqueOrThrow({ where: { id } });
  }

  async removeSource(workspaceId: string, id: string) {
    const result = await this.prisma.client.knowledgeSource.deleteMany({ where: { id, workspaceId } });
    if (result.count === 0) throw new NotFoundException("Knowledge source not found");
  }

  // Shared by the sync (text/pdf/sheet) and async (website, via worker) paths.
  async rebuildChunks(sourceId: string, workspaceId: string, content: string) {
    const pieces = chunkText(content);
    await this.prisma.client.$transaction([
      this.prisma.client.knowledgeChunk.deleteMany({ where: { sourceId } }),
      ...pieces.map((content, order) => this.prisma.client.knowledgeChunk.create({ data: { workspaceId, sourceId, content, order } }))
    ]);
  }

  listFaqs(workspaceId: string) {
    return this.prisma.client.faq.findMany({ where: { workspaceId }, orderBy: { usageCount: "desc" } });
  }

  createFaq(workspaceId: string, dto: CreateFaqDto) {
    return this.prisma.client.faq.create({ data: { workspaceId, question: dto.question, answer: dto.answer, sourceId: dto.sourceId } });
  }

  async updateFaq(workspaceId: string, id: string, dto: UpdateFaqDto) {
    const result = await this.prisma.client.faq.updateMany({ where: { id, workspaceId }, data: dto });
    if (result.count === 0) throw new NotFoundException("FAQ not found");
    return this.prisma.client.faq.findUniqueOrThrow({ where: { id } });
  }

  async removeFaq(workspaceId: string, id: string) {
    const result = await this.prisma.client.faq.deleteMany({ where: { id, workspaceId } });
    if (result.count === 0) throw new NotFoundException("FAQ not found");
  }

  // Auto-saves generated FAQs — no review-before-save step in v1 (docs/
  // PROGRESS.md Phase 2 item 1 simplification).
  async generateFaqs(workspaceId: string, dto: GenerateFaqsDto) {
    const source = await this.prisma.client.knowledgeSource.findFirst({ where: { id: dto.sourceId, workspaceId } });
    if (!source) throw new NotFoundException("Knowledge source not found");
    if (!source.content) throw new BadRequestException("This source has no extracted text yet");

    const generated = await this.ai.generateFaqsFromContent(source.content);
    if (generated.length === 0) return [];

    return this.prisma.client.$transaction(
      generated.map((f) => this.prisma.client.faq.create({ data: { workspaceId, question: f.question, answer: f.answer, sourceId: source.id } }))
    );
  }

  async getSettings(workspaceId: string) {
    const existing = await this.prisma.client.aiSettings.findUnique({ where: { workspaceId } });
    return existing ?? { workspaceId, ...DEFAULT_AI_SETTINGS };
  }

  updateSettings(workspaceId: string, dto: UpdateAiSettingsDto) {
    return this.prisma.client.aiSettings.upsert({
      where: { workspaceId },
      create: { workspaceId, ...DEFAULT_AI_SETTINGS, ...dto },
      update: dto
    });
  }

  async testChat(workspaceId: string, dto: TestChatDto) {
    const credits = await this.usage.checkAiCredits(workspaceId);
    if (!credits.allowed) {
      return {
        answer: "AI credits are used up for this month — a real bot would hand this conversation over to a human here.",
        citedSourceId: null,
        citedSourceName: null,
        handover: true,
        creditsRemaining: 0
      };
    }

    const settings = await this.getSettings(workspaceId);
    const [chunks, faqs] = await Promise.all([
      this.prisma.client.knowledgeChunk.findMany({ where: { workspaceId }, include: { source: true } }),
      this.prisma.client.faq.findMany({ where: { workspaceId } })
    ]);

    const entries: RankableEntry[] = [
      ...chunks.map((c) => ({ id: c.id, kind: "chunk" as const, sourceId: c.sourceId, label: c.source.name, content: c.content })),
      ...faqs.map((f) => ({ id: f.id, kind: "faq" as const, sourceId: f.sourceId, label: `FAQ: ${f.question}`, content: `${f.question}\n${f.answer}` }))
    ];

    const topEntries = rankChunksByKeywords(entries, dto.question, 4);
    const context = buildKnowledgeContext(topEntries.map((e) => ({ id: e.id, label: e.label, content: e.content })));

    const result = await this.ai.answerFromKnowledge({
      question: dto.question,
      context,
      tone: settings.tone,
      languages: settings.languages,
      answerOnlyFromSources: settings.answerOnlyFromSources,
      handoverOnDiscountAsked: settings.handoverOnDiscountAsked,
      alwaysEndWithNextStep: settings.alwaysEndWithNextStep,
      replyInLeadsLanguage: settings.replyInLeadsLanguage,
      sharePricesToggle: settings.sharePricesToggle
    });

    const cited = result.citedIndex !== null ? topEntries[result.citedIndex - 1] : undefined;
    if (cited?.kind === "faq") {
      await this.prisma.client.faq.update({ where: { id: cited.id }, data: { usageCount: { increment: 1 } } });
    }

    const debit = await this.usage.debitAiReplyCredit(workspaceId);

    return {
      answer: result.answer,
      citedSourceId: cited?.sourceId ?? null,
      citedSourceName: cited?.label ?? null,
      handover: result.handover,
      creditsRemaining: debit.remaining
    };
  }
}
