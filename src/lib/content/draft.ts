import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { trackedGenerateObject } from "@/lib/ai/track";
import { db, schema } from "@/lib/db";
import { verticalProfile, heroProductFor, type ContentVertical } from "./verticals";
import { uniqueSlug } from "./slug";

const DraftSchema = z.object({
  title: z.string().min(8).max(160),
  excerpt: z.string().min(40).max(280),
  bodyMdx: z.string().min(800),
});

export type GeneratedDraft = z.infer<typeof DraftSchema>;

interface DraftFromBriefArgs {
  briefId: string;
}

interface RegenSectionArgs {
  pieceId: string;
  heading: string;
  instruction?: string;
}

async function loadBriefWithKb(briefId: string) {
  const [brief] = await db
    .select()
    .from(schema.contentBriefs)
    .where(eq(schema.contentBriefs.id, briefId))
    .limit(1);
  if (!brief) throw new Error("brief_not_found");

  const citationKeys = (brief.outline ?? [])
    .flatMap((s) => s.kbCitations ?? [])
    .map((c) => c.sourceId);
  const uniqueSourceIds = Array.from(new Set(citationKeys));

  const sources =
    uniqueSourceIds.length === 0
      ? []
      : await db
          .select({
            id: schema.knowledgeSources.id,
            title: schema.knowledgeSources.title,
            rawContent: schema.knowledgeSources.rawContent,
          })
          .from(schema.knowledgeSources)
          .where(inArray(schema.knowledgeSources.id, uniqueSourceIds));

  return { brief, sources };
}

function buildDraftPrompt(args: {
  vertical: ContentVertical;
  brief: typeof schema.contentBriefs.$inferSelect;
  sources: Array<{ id: string; title: string; rawContent: string }>;
}) {
  const profile = verticalProfile(args.vertical);
  const hero = heroProductFor(args.vertical);

  const kbBlock =
    args.sources.length === 0
      ? "(no KB sources; use only general knowledge and stay conservative)"
      : args.sources
          .map((s, i) => `[${i + 1}] ${s.title}\n${s.rawContent.slice(0, 2500)}`)
          .join("\n\n---\n\n");

  const outline = args.brief.outline
    .map(
      (s, i) =>
        `## ${i + 1}. ${s.heading}\nBullets:\n${s.bullets.map((b) => `- ${b}`).join("\n")}`,
    )
    .join("\n\n");

  const faqs = args.brief.faqs
    .map((f, i) => `${i + 1}. ${f.q}\n   → ${f.a}`)
    .join("\n");

  const heroLine = hero
    ? `Featured product (CTA target): ${hero.name}. Certifications: ${hero.certifications.join(", ")}. Positioning: ${hero.positioning.join(", ")}.`
    : "";

  return `Write a long-form B2B SEO article for USProGlove.

Vertical: ${profile.label}
Audience: ${args.brief.audience}
Target keywords: ${(args.brief.targetKeywords ?? []).join(", ")}
${heroLine}

Outline (follow exactly; use ## for H2 section headings; do NOT invent extra
top-level sections beyond what's listed plus a short intro and conclusion):
${outline}

FAQ section to include at the end (use ## FAQ then ### per question):
${faqs}

Knowledge sources (cite facts conservatively; never fabricate certifications,
test numbers, or pricing):
${kbBlock}

Output requirements:
- title: SEO-friendly H1 (50–70 chars), include primary keyword naturally
- excerpt: 140–260 char meta-style summary, no clickbait
- bodyMdx: complete article in MDX. Structure:
  1) 2–3 paragraph intro (no heading)
  2) Each H2 section from the outline, 2–4 paragraphs each, prose only — no
     bullet dumps; weave the bullet points into flowing text
  3) ## FAQ followed by ### one heading per question/answer
  4) ## Bottom line / call to action — 1 paragraph nudging readers to request
     a sample/quote of the featured product
- 1500–2500 words total
- US English, second person ("you"), professional B2B tone
- Plain MDX: only #, ##, ###, paragraphs, bullet lists, and **bold**. No HTML
  tags, no images, no front-matter`;
}

export async function draftFromBrief(args: DraftFromBriefArgs): Promise<{
  pieceId: string;
  slug: string;
  draft: GeneratedDraft;
}> {
  const { brief, sources } = await loadBriefWithKb(args.briefId);
  const vertical = brief.vertical as ContentVertical;

  const prompt = buildDraftPrompt({ vertical, brief, sources });

  const result = await trackedGenerateObject({
    task: "draft",
    modelKey: "primary",
    schema: DraftSchema,
    prompt,
    metadata: { feature: "content.draft", briefId: brief.id, vertical },
  });
  const draft = result.object;

  const slug = await uniqueSlug(draft.title, brief.locale);
  const wordCount = countWords(draft.bodyMdx);
  const hero = heroProductFor(vertical);

  const [piece] = await db
    .insert(schema.contentPieces)
    .values({
      slug,
      vertical,
      locale: brief.locale,
      title: draft.title,
      description: draft.excerpt,
      excerpt: draft.excerpt,
      bodyMdx: draft.bodyMdx,
      heroSkuId: brief.ctaSkuId ?? hero?.id,
      keywords: brief.targetKeywords,
      briefId: brief.id,
      clusterId: brief.clusterId ?? undefined,
      status: "draft",
      intent: brief.intent,
      wordCount,
    })
    .returning({ id: schema.contentPieces.id, slug: schema.contentPieces.slug });

  return { pieceId: piece.id, slug: piece.slug, draft };
}

const SectionSchema = z.object({ bodyMdx: z.string().min(60) });

export async function regenerateSection(args: RegenSectionArgs): Promise<string> {
  const [piece] = await db
    .select()
    .from(schema.contentPieces)
    .where(eq(schema.contentPieces.id, args.pieceId))
    .limit(1);
  if (!piece) throw new Error("piece_not_found");

  const section = extractSection(piece.bodyMdx, args.heading);
  if (!section) throw new Error("section_not_found");

  const profile = verticalProfile(piece.vertical as ContentVertical);

  const prompt = `Rewrite the following section of a B2B SEO article.

Article title: ${piece.title}
Vertical: ${profile.label}
Section heading: "${args.heading}"
${args.instruction ? `Additional instruction: ${args.instruction}` : ""}

Existing section MDX:
"""
${section.body}
"""

Return the FULL replacement section MDX, INCLUDING the same "## ${args.heading}"
heading line. Keep US English, 2–4 paragraphs, prose (no bullet dumps), no HTML.`;

  const result = await trackedGenerateObject({
    task: "draft",
    modelKey: "primary",
    schema: SectionSchema,
    prompt,
    metadata: { feature: "content.regen_section", pieceId: piece.id },
  });

  const updated =
    piece.bodyMdx.slice(0, section.start) +
    result.object.bodyMdx.trim() +
    "\n" +
    piece.bodyMdx.slice(section.end);

  await db
    .update(schema.contentPieces)
    .set({ bodyMdx: updated, wordCount: countWords(updated), updatedAt: new Date() })
    .where(eq(schema.contentPieces.id, piece.id));

  return updated;
}

function extractSection(body: string, heading: string): { start: number; end: number; body: string } | null {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(^|\\n)##\\s+${escaped}\\s*\\n`);
  const match = re.exec(body);
  if (!match) return null;
  const start = match.index + (match[1] ? 1 : 0);
  const restStart = match.index + match[0].length;
  const nextH2 = body.slice(restStart).search(/\n##\s+/);
  const end = nextH2 === -1 ? body.length : restStart + nextH2 + 1;
  return { start, end, body: body.slice(start, end) };
}

export function countWords(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}
