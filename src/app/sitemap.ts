import type { MetadataRoute } from "next";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { CONTENT_VERTICALS, type ContentVertical } from "@/lib/content/verticals";
import { articleUrl, hubUrl, siteOrigin } from "@/lib/content/seo";
import { routing } from "@/i18n/routing";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [];
  const origin = siteOrigin();

  for (const locale of routing.locales) {
    const prefix = locale === routing.defaultLocale ? "" : `/${locale}`;
    entries.push({
      url: `${origin}${prefix || "/"}`,
      changeFrequency: "weekly",
      priority: 1.0,
    });
    for (const v of CONTENT_VERTICALS) {
      entries.push({
        url: hubUrl({ locale, vertical: v }),
        changeFrequency: "weekly",
        priority: 0.8,
      });
    }
  }

  try {
    const pieces = await db
      .select({
        slug: schema.contentPieces.slug,
        locale: schema.contentPieces.locale,
        vertical: schema.contentPieces.vertical,
        updatedAt: schema.contentPieces.updatedAt,
        publishedAt: schema.contentPieces.publishedAt,
      })
      .from(schema.contentPieces)
      .where(and(eq(schema.contentPieces.status, "published")))
      .limit(5000);

    for (const p of pieces) {
      entries.push({
        url: articleUrl({
          locale: p.locale,
          vertical: p.vertical as ContentVertical,
          slug: p.slug,
        }),
        lastModified: p.updatedAt ?? p.publishedAt ?? undefined,
        changeFrequency: "monthly",
        priority: 0.7,
      });
    }
  } catch {
    // If the table or status column isn't there yet, just return the static
    // entries above — a sitemap with hubs only is still useful.
  }

  return entries;
}
