import { prisma } from "@zenora/db";
import { chunkText, extractTextFromHtml } from "@zenora/shared";

// Only "website" sources land here — text/pdf/sheet are processed
// synchronously in apps/api/src/knowledge/knowledge.service.ts since their
// content is already provided at creation time (see docs/PROGRESS.md Phase 2
// item 1 simplification: paste extracted text for pdf/sheet, no file
// upload/parsing yet).
export async function processKnowledgeSource(sourceId: string): Promise<void> {
  const source = await prisma.knowledgeSource.findUnique({ where: { id: sourceId } });
  if (!source) return;

  try {
    if (source.type !== "website" || !source.sourceUrl) {
      throw new Error("Only website sources are processed asynchronously");
    }

    const res = await fetch(source.sourceUrl);
    if (!res.ok) throw new Error(`Fetch failed with status ${res.status}`);
    const html = await res.text();
    const content = extractTextFromHtml(html);
    const pieces = chunkText(content);

    await prisma.$transaction([
      prisma.knowledgeChunk.deleteMany({ where: { sourceId } }),
      ...pieces.map((chunkContent, order) =>
        prisma.knowledgeChunk.create({ data: { workspaceId: source.workspaceId, sourceId, content: chunkContent, order } })
      ),
      prisma.knowledgeSource.update({ where: { id: sourceId }, data: { content, status: "ready", errorMessage: null } })
    ]);
  } catch (err) {
    console.error(`Knowledge source ${sourceId} processing failed:`, err);
    await prisma.knowledgeSource
      .update({ where: { id: sourceId }, data: { status: "failed", errorMessage: (err as Error).message } })
      .catch(() => {});
  }
}
