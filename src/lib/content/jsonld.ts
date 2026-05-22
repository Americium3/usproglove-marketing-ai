import type { schema } from "@/lib/db";
import { articleUrl, hubUrl, siteOrigin } from "./seo";
import { verticalProfile, type ContentVertical } from "./verticals";

type Piece = typeof schema.contentPieces.$inferSelect;

export function buildArticleJsonLd(piece: Piece): Record<string, unknown> {
  const vertical = piece.vertical as ContentVertical;
  const profile = verticalProfile(vertical);
  const url = articleUrl({ locale: piece.locale, vertical, slug: piece.slug });

  const article: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: piece.title,
    description: piece.seoDescription ?? piece.description ?? piece.excerpt ?? piece.title,
    mainEntityOfPage: url,
    url,
    inLanguage: piece.locale,
    datePublished: (piece.publishedAt ?? piece.createdAt).toISOString(),
    dateModified: piece.updatedAt.toISOString(),
    author: { "@type": "Organization", name: "USProGlove", url: siteOrigin() },
    publisher: {
      "@type": "Organization",
      name: "USProGlove",
      url: siteOrigin(),
      logo: { "@type": "ImageObject", url: `${siteOrigin()}/logo.png` },
    },
    about: { "@type": "Thing", name: profile.label },
    keywords: (piece.keywords ?? []).join(", "),
    wordCount: piece.wordCount || undefined,
  };
  if (piece.ogImageUrl) {
    article.image = piece.ogImageUrl;
  }

  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: siteOrigin() },
      {
        "@type": "ListItem",
        position: 2,
        name: profile.label,
        item: hubUrl({ locale: piece.locale, vertical }),
      },
      { "@type": "ListItem", position: 3, name: piece.title, item: url },
    ],
  };

  const faqs = extractFaqs(piece.bodyMdx);
  const graph: Record<string, unknown>[] = [article, breadcrumb];
  if (faqs.length > 0) {
    graph.push({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faqs.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    });
  }
  return { "@context": "https://schema.org", "@graph": graph };
}

export function buildHubJsonLd(args: {
  vertical: ContentVertical;
  locale: string;
  articles: Pick<Piece, "title" | "slug" | "locale" | "vertical" | "excerpt" | "description">[];
}): Record<string, unknown> {
  const profile = verticalProfile(args.vertical);
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: profile.label,
    description: profile.tagline,
    url: hubUrl({ locale: args.locale, vertical: args.vertical }),
    inLanguage: args.locale,
    mainEntity: {
      "@type": "ItemList",
      itemListElement: args.articles.map((a, i) => ({
        "@type": "ListItem",
        position: i + 1,
        url: articleUrl({
          locale: a.locale,
          vertical: a.vertical as ContentVertical,
          slug: a.slug,
        }),
        name: a.title,
      })),
    },
  };
}

function extractFaqs(body: string): Array<{ q: string; a: string }> {
  const faqHeaderRe = /\n##\s+FAQ[^\n]*\n/i;
  const m = faqHeaderRe.exec(body);
  if (!m) return [];
  const after = body.slice(m.index + m[0].length);
  const stopIdx = after.search(/\n##\s+/);
  const region = stopIdx === -1 ? after : after.slice(0, stopIdx);

  const out: Array<{ q: string; a: string }> = [];
  const parts = region.split(/\n###\s+/).slice(1);
  for (const part of parts) {
    const nl = part.indexOf("\n");
    if (nl === -1) continue;
    const q = part.slice(0, nl).trim();
    const a = part
      .slice(nl + 1)
      .trim()
      .replace(/\n+/g, " ");
    if (q && a) out.push({ q, a });
  }
  return out.slice(0, 12);
}
