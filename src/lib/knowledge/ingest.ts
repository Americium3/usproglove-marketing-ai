import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { chunkText } from "./chunk";
import { embedBatch } from "./embed";

export interface IngestInput {
  title: string;
  rawContent: string;
  kind?: "text" | "mdx" | "url" | "pdf";
  vertical?: (typeof schema.verticalEnum.enumValues)[number];
  category?: string;
  sourceUrl?: string;
  createdBy?: string;
}

export interface IngestResult {
  sourceId: string;
  chunkCount: number;
}

/**
 * Create a knowledge source, chunk its content, embed each chunk, and persist
 * everything in one logical operation. Re-ingesting an existing title is the
 * caller's responsibility — use {@link reingestSource} to replace chunks.
 */
export async function ingestSource(input: IngestInput): Promise<IngestResult> {
  const chunks = chunkText(input.rawContent);
  const embeddings = await embedBatch(chunks);

  const [source] = await db
    .insert(schema.knowledgeSources)
    .values({
      title: input.title,
      kind: input.kind ?? "text",
      vertical: input.vertical,
      category: input.category,
      sourceUrl: input.sourceUrl,
      rawContent: input.rawContent,
      createdBy: input.createdBy,
    })
    .returning({ id: schema.knowledgeSources.id });

  if (chunks.length > 0) {
    await db.insert(schema.knowledgeChunks).values(
      chunks.map((text, ord) => ({
        sourceId: source.id,
        ord,
        text,
        embedding: embeddings[ord] ?? null,
      })),
    );
  }

  return { sourceId: source.id, chunkCount: chunks.length };
}

/**
 * Drop and rebuild all chunks for an existing source. Used when the source's
 * raw content changes — embedding is expensive so we don't re-run it on metadata
 * edits.
 */
export async function reingestSource(sourceId: string, newContent: string): Promise<IngestResult> {
  await db
    .update(schema.knowledgeSources)
    .set({ rawContent: newContent, updatedAt: new Date() })
    .where(eq(schema.knowledgeSources.id, sourceId));
  await db.delete(schema.knowledgeChunks).where(eq(schema.knowledgeChunks.sourceId, sourceId));

  const chunks = chunkText(newContent);
  const embeddings = await embedBatch(chunks);

  if (chunks.length > 0) {
    await db.insert(schema.knowledgeChunks).values(
      chunks.map((text, ord) => ({
        sourceId,
        ord,
        text,
        embedding: embeddings[ord] ?? null,
      })),
    );
  }

  return { sourceId, chunkCount: chunks.length };
}

export async function deleteSource(sourceId: string): Promise<void> {
  await db.delete(schema.knowledgeSources).where(eq(schema.knowledgeSources.id, sourceId));
}
