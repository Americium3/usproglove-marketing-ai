import { embed, embedMany } from "ai";
import { gateway } from "@ai-sdk/gateway";

const MODEL_ID = "openai/text-embedding-3-small";
export const EMBEDDING_DIMENSIONS = 1536;

function model() {
  return gateway.textEmbeddingModel(MODEL_ID);
}

export async function embedQuery(text: string): Promise<number[]> {
  const { embedding } = await embed({ model: model(), value: text });
  return embedding;
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const { embeddings } = await embedMany({ model: model(), values: texts });
  return embeddings;
}
