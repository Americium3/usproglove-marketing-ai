import { eq } from "drizzle-orm";
import { z } from "zod";
import { trackedGenerateObject } from "@/lib/ai/track";
import { db, schema } from "@/lib/db";
import { retrieveChunks, type RetrievedChunk } from "@/lib/knowledge/retrieve";
import { verticalProfile, heroProductFor, type ContentVertical } from "./verticals";

const BriefSchema = z.object({
  title: z.string().min(8).max(160),
  audience: z.string().min(4).max(200),
  targetKeywords: z.array(z.string().min(2)).min(3).max(15),
  outline: z
    .array(
      z.object({
        heading: z.string().min(3),
        bullets: z.array(z.string().min(3)).min(2).max(8),
        kbCitationOrdinals: z.array(z.number().int().min(1)).optional(),
      }),
    )
    .min(3)
    .max(10),
  faqs: z
    .array(z.object({ q: z.string().min(5), a: z.string().min(10) }))
    .min(2)
    .max(8),
});

export type GeneratedBrief = z.infer<typeof BriefSchema>;

interface BuildBriefArgs {
  clusterId?: string;
  vertical: ContentVertical;
  locale?: string;
  seedQuery: string;
  ctaSkuId?: string;
}

interface BuiltBrief {
  brief: GeneratedBrief;
  citations: RetrievedChunk[];
}

export async function buildBriefFromKb(args: BuildBriefArgs): Promise<BuiltBrief> {
  const profile = verticalProfile(args.vertical);
  const hero = heroProductFor(args.vertical);
  const locale = args.locale ?? "en";

  const chunks = await retrieveChunks(args.seedQuery, {
    k: 8,
    vertical: args.vertical,
    minSimilarity: 0.25,
  });

  const kbBlock =
    chunks.length === 0
      ? "(no knowledge-base citations available — write a generic but honest brief)"
      : chunks
          .map(
            (c, i) =>
              `[${i + 1}] ${c.sourceTitle} (similarity ${c.similarity.toFixed(2)}):\n${c.text.slice(0, 700)}`,
          )
          .join("\n\n");

  const heroLine = hero
    ? `Hero SKU: ${hero.name} — ${hero.positioning.slice(0, 4).join(", ")}; certifications: ${hero.certifications.slice(0, 4).join(", ")}`
    : "";

  const prompt = `Build an editorial brief for a long-form SEO article.

Vertical: ${profile.label}
Audience: ${profile.audience}
Locale: ${locale}
Seed query: "${args.seedQuery}"
${heroLine}

Knowledge-base excerpts (cite by ordinal number in kbCitationOrdinals when a
section relies on one):
${kbBlock}

Brief must contain:
- title: SEO headline (50–70 chars preferred), include primary keyword naturally
- audience: who this article is for
- targetKeywords: 5–10 keywords/phrases the article should rank for
- outline: 4–8 H2 sections; each section has 3–6 bullet points; cite the KB
  excerpt ordinal(s) you would draw from
- faqs: 3–6 question/answer pairs (questions buyers actually ask)

Stay factual. If a claim is not in the KB, mark it as general industry knowledge
in bullet text. Never invent certifications, test numbers, or pricing.`;

  const result = await trackedGenerateObject({
    task: "extract",
    modelKey: "primary",
    schema: BriefSchema,
    prompt,
    metadata: {
      feature: "content.brief",
      vertical: args.vertical,
      clusterId: args.clusterId,
      kbHits: chunks.length,
    },
  });

  return { brief: result.object, citations: chunks };
}

export async function saveBrief(args: {
  clusterId?: string;
  vertical: ContentVertical;
  locale?: string;
  built: BuiltBrief;
  ctaSkuId?: string;
  intent?: "informational" | "commercial" | "transactional" | "navigational";
  createdBy?: string;
}) {
  const outline = args.built.brief.outline.map((section) => ({
    heading: section.heading,
    bullets: section.bullets,
    kbCitations: (section.kbCitationOrdinals ?? [])
      .map((n) => args.built.citations[n - 1])
      .filter(Boolean)
      .map((c) => ({ sourceId: c.sourceId, ord: c.ord })),
  }));

  const [row] = await db
    .insert(schema.contentBriefs)
    .values({
      clusterId: args.clusterId,
      vertical: args.vertical,
      locale: args.locale ?? "en",
      title: args.built.brief.title,
      audience: args.built.brief.audience,
      intent: args.intent ?? "informational",
      targetKeywords: args.built.brief.targetKeywords,
      outline,
      faqs: args.built.brief.faqs,
      ctaSkuId: args.ctaSkuId,
      createdBy: args.createdBy,
    })
    .returning({ id: schema.contentBriefs.id });
  return row.id;
}

export async function getBrief(briefId: string) {
  const [row] = await db.select().from(schema.contentBriefs).where(eq(schema.contentBriefs.id, briefId)).limit(1);
  return row ?? null;
}
