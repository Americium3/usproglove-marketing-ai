import { eq } from "drizzle-orm";
import { z } from "zod";
import { trackedGenerateObject } from "@/lib/ai/track";
import { db, schema } from "@/lib/db";
import { verticalProfile, type ContentVertical } from "./verticals";

const SeoSchema = z.object({
  seoTitle: z.string().min(20).max(70),
  seoDescription: z.string().min(80).max(180),
});

export function siteOrigin(): string {
  const raw = process.env.PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || "https://usproglove.com";
  return raw.replace(/\/$/, "");
}

export function articlePath(args: { locale: string; vertical: ContentVertical; slug: string }): string {
  const localePrefix = args.locale === "en" ? "" : `/${args.locale}`;
  return `${localePrefix}/blog/${args.vertical}/${args.slug}`;
}

export function articleUrl(args: { locale: string; vertical: ContentVertical; slug: string }): string {
  return `${siteOrigin()}${articlePath(args)}`;
}

export function hubPath(args: { locale: string; vertical: ContentVertical }): string {
  const localePrefix = args.locale === "en" ? "" : `/${args.locale}`;
  return `${localePrefix}/industries/${args.vertical}`;
}

export function hubUrl(args: { locale: string; vertical: ContentVertical }): string {
  return `${siteOrigin()}${hubPath(args)}`;
}

export async function generateSeoMeta(pieceId: string) {
  const [piece] = await db
    .select()
    .from(schema.contentPieces)
    .where(eq(schema.contentPieces.id, pieceId))
    .limit(1);
  if (!piece) throw new Error("piece_not_found");

  const profile = verticalProfile(piece.vertical as ContentVertical);
  const keywords = piece.keywords ?? [];
  const sample = piece.bodyMdx.slice(0, 1800);

  const prompt = `Write SEO meta tags for the article below.

Vertical: ${profile.label}
Primary keywords: ${keywords.slice(0, 6).join(", ")}
Article title: ${piece.title}
Article opening:
"""
${sample}
"""

Requirements:
- seoTitle: 50–65 chars, primary keyword near the start, ends with " · USProGlove"
  ONLY if the full string still fits within 65 chars (otherwise omit suffix)
- seoDescription: 140–170 chars, contains a benefit + a soft CTA verb
  ("request", "see", "compare"), no clickbait, no emoji`;

  const result = await trackedGenerateObject({
    task: "extract",
    modelKey: "fast",
    schema: SeoSchema,
    prompt,
    metadata: { feature: "content.seo", pieceId },
  });

  const canonical = articleUrl({
    locale: piece.locale,
    vertical: piece.vertical as ContentVertical,
    slug: piece.slug,
  });

  await db
    .update(schema.contentPieces)
    .set({
      seoTitle: result.object.seoTitle,
      seoDescription: result.object.seoDescription,
      canonicalUrl: canonical,
      updatedAt: new Date(),
    })
    .where(eq(schema.contentPieces.id, pieceId));

  return { ...result.object, canonicalUrl: canonical };
}
