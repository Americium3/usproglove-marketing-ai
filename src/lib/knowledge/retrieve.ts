import { and, cosineDistance, desc, eq, gt, sql, type SQL } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { embedQuery } from "./embed";

export interface RetrieveOptions {
  k?: number;
  vertical?: (typeof schema.verticalEnum.enumValues)[number];
  category?: string;
  minSimilarity?: number;
}

export interface RetrievedChunk {
  sourceId: string;
  sourceTitle: string;
  sourceKind: string;
  vertical: string | null;
  category: string | null;
  ord: number;
  text: string;
  similarity: number;
}

/**
 * Cosine-similarity ANN search over chunk embeddings, optionally filtered by
 * vertical / category. Similarity = 1 - cosine_distance, so 1.0 = identical
 * direction, 0.0 = orthogonal. Default cutoff 0.3 strips obviously-unrelated
 * hits from the top-k.
 */
export async function retrieveChunks(query: string, opts: RetrieveOptions = {}): Promise<RetrievedChunk[]> {
  const k = opts.k ?? 5;
  const minSimilarity = opts.minSimilarity ?? 0.3;

  const queryEmbedding = await embedQuery(query);

  const similarity = sql<number>`1 - (${cosineDistance(schema.knowledgeChunks.embedding, queryEmbedding)})`;

  const filters: SQL[] = [gt(similarity, minSimilarity)];
  if (opts.vertical) filters.push(eq(schema.knowledgeSources.vertical, opts.vertical));
  if (opts.category) filters.push(eq(schema.knowledgeSources.category, opts.category));

  const rows = await db
    .select({
      sourceId: schema.knowledgeSources.id,
      sourceTitle: schema.knowledgeSources.title,
      sourceKind: schema.knowledgeSources.kind,
      vertical: schema.knowledgeSources.vertical,
      category: schema.knowledgeSources.category,
      ord: schema.knowledgeChunks.ord,
      text: schema.knowledgeChunks.text,
      similarity,
    })
    .from(schema.knowledgeChunks)
    .innerJoin(schema.knowledgeSources, eq(schema.knowledgeSources.id, schema.knowledgeChunks.sourceId))
    .where(and(...filters))
    .orderBy(desc(similarity))
    .limit(k);

  return rows.map((r) => ({
    sourceId: r.sourceId,
    sourceTitle: r.sourceTitle,
    sourceKind: r.sourceKind,
    vertical: r.vertical,
    category: r.category,
    ord: r.ord,
    text: r.text,
    similarity: Number(r.similarity),
  }));
}
