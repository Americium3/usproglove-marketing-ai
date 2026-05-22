import { z } from "zod";
import { trackedGenerateObject } from "@/lib/ai/track";
import { schema } from "@/lib/db";

const KNOWN_CATEGORIES = ["persona", "objection", "positioning", "cert", "faq", "spec"] as const;

const Schema = z.object({
  vertical: z
    .enum(schema.verticalEnum.enumValues)
    .nullable()
    .describe("the single best vertical for this content, or null if it spans multiple / none clearly fits"),
  category: z
    .enum(KNOWN_CATEGORIES)
    .nullable()
    .describe("the curated category bucket, or null if no listed bucket fits well"),
  confidence: z.number().min(0).max(1),
});

export interface AutoTagInput {
  title: string;
  text: string;
}

export interface AutoTagOutput {
  vertical: (typeof schema.verticalEnum.enumValues)[number] | null;
  category: string | null;
}

/**
 * Infer vertical + category from raw knowledge text. Cheap model (Haiku) — only
 * called when the operator did not provide tags. Returns nulls when confidence
 * is low so we don't overwrite with a guess.
 */
export async function autoTagKnowledge(input: AutoTagInput): Promise<AutoTagOutput> {
  const verticals = schema.verticalEnum.enumValues.join(", ");
  const categories = KNOWN_CATEGORIES.join(", ");
  const snippet = input.text.slice(0, 2400);

  const prompt = `Classify a USProGlove knowledge-base entry.

Choose ONE vertical from: ${verticals}. Use "supplier" for upstream factory / sourcing content. Pick null if the content is generic or spans many industries.

Choose ONE category from: ${categories}.
- persona: buyer profile, decision-maker traits, how they think
- objection: pushback the buyer raises, and how to answer
- positioning: pitch language, value props, differentiation
- cert: certifications, regulatory compliance docs (FDA, CE, ASTM, EN 455…)
- faq: common buyer questions and answers
- spec: product specifications, technical numbers, SKUs

Pick null if no listed category fits well.

Set confidence in [0,1]. If under 0.55, prefer null on both fields.

Title: ${input.title}

Content (first 2400 chars):
${snippet}`;

  try {
    const result = await trackedGenerateObject({
      task: "extract",
      modelKey: "fast",
      schema: Schema,
      prompt,
      metadata: { surface: "knowledge_autotag" },
    });
    const o = result.object;
    if (o.confidence < 0.55) return { vertical: null, category: null };
    return { vertical: o.vertical, category: o.category };
  } catch {
    return { vertical: null, category: null };
  }
}
