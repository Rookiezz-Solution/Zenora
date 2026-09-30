// Pure knowledge-base logic shared between apps/api (CRUD, test chat) and
// apps/worker (website-source ingestion) — same DI-boundary reason routing.ts
// and sequences.ts are duplicated-by-import rather than cross-imported.

const MAX_CHUNK_CHARS = 1000;

// Splits on blank lines first (paragraphs), then hard-wraps any paragraph
// that's still too long — good enough for FAQ/product-doc style content
// without pulling in a real text-segmentation library.
export function chunkText(content: string): string[] {
  const normalized = content.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  const paragraphs = normalized.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const chunks: string[] = [];
  for (const paragraph of paragraphs) {
    if (paragraph.length <= MAX_CHUNK_CHARS) {
      chunks.push(paragraph);
      continue;
    }
    for (let i = 0; i < paragraph.length; i += MAX_CHUNK_CHARS) {
      chunks.push(paragraph.slice(i, i + MAX_CHUNK_CHARS));
    }
  }
  return chunks;
}

// Minimal HTML-to-text for "website" sources — strips scripts/styles/tags
// and collapses whitespace. Not a real readability extractor; good enough
// for FAQ/product pages (see docs/PROGRESS.md simplification note).
export function extractTextFromHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export interface RankableChunk {
  id: string;
  content: string;
}

// Keyword-overlap ranking — no embeddings/pgvector yet (needs an embeddings
// provider decision, deferred; docs/PROGRESS.md simplification). Good enough
// for the FAQ/product-doc scale a single workspace's knowledge base has.
export function rankChunksByKeywords<T extends RankableChunk>(chunks: T[], query: string, limit = 4): T[] {
  const terms = query
    .toLowerCase()
    .split(/\W+/)
    .filter((t) => t.length > 2);
  if (terms.length === 0) return chunks.slice(0, limit);

  const scored = chunks.map((chunk) => {
    const lower = chunk.content.toLowerCase();
    const score = terms.reduce((sum, term) => sum + (lower.includes(term) ? 1 : 0), 0);
    return { chunk, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.chunk);
}

export interface KnowledgeContextEntry {
  id: string;
  label: string; // shown to the model as "[1]", "[2]", ...
  content: string;
}

// Builds the numbered, citable context block the AI prompt references —
// entries can come from knowledge chunks and/or FAQs.
export function buildKnowledgeContext(entries: KnowledgeContextEntry[]): string {
  return entries.map((e, i) => `[${i + 1}] ${e.label}\n${e.content}`).join("\n\n");
}
